#!/usr/bin/env node
const i2c = require('i2c')
const _ = require('lodash')
const debug = require('debug')('ddcci')
const TypedError = require('error/typed')

// http://stackoverflow.com/a/23073178
const rateLimit = function(fn, delay, context) {
    var canInvoke = true,
        queue = [],
        timeout,
        limited = function () {
            queue.push({
                context: context || this,
                arguments: Array.prototype.slice.call(arguments)
            });
            if (canInvoke) {
                canInvoke = false;
                timeEnd();
            }
        };
    function run(context, args) {
        fn.apply(context, args);
    }
    function timeEnd() {
        var e;
        if (queue.length) {
            e = queue.splice(0, 1)[0];
            run(e.context, e.arguments);
            timeout = setTimeout(timeEnd, delay);
        } else
            canInvoke = true;
    }
    limited.reset = function () {
        clearTimeout(timeout);
        queue = [];
        canInvoke = true;
    };
    return limited;
}

const MAGIC_1 = 0x51
const MAGIC_2 = 0x80

const DDCCI_COMMAND_READ = 0x01
const DDCCI_REPLY_READ = 0x02
const DDCCI_COMMAND_WRITE = 0x03

const DEFAULT_DDCCI_ADDR = 0x37

const READ_DELAY = 60, WRITE_DELAY = 60 // ms

const ReadError = TypedError({
  type: 'read',
  message: '{title}',
  title: null
})

var calculateChecksum = function(data, xor) {
  if (arguments.length < 2) { xor = 0 }
  for (var i = 0, len = data.length, x; x = data[i], i < len; i++) {
    xor ^= x
  }
  return xor;
}

function DDCCIDevice(bus, address) {
  if (arguments.length < 3) { address = DEFAULT_DDCCI_ADDR }
  if (!(this instanceof DDCCIDevice)) { return new DDCCIDevice(bus, address) }
  if (bus instanceof i2c) {
    this.bus = bus
  } else {
    if (_.isNumber(bus)) { bus = '/dev/i2c-' + bus; }
    this.bus = new i2c(address, {device: bus})
  }
  debug(this.bus)
}

DDCCIDevice.prototype.write = function(ctrl, value, callback) {
  var payload = this.preparePayload(
    [DDCCI_COMMAND_WRITE, ctrl, (value >> 8) & 255, value & 255]
  )

  this.writePayload(payload, callback)
}

// TODO

// DDCCIDevice.prototype.read = function(ctrl, callback, extended) {
//   if (arguments.length < 3) { extended = false }
//   var payload = this.preparePayload([DDCCI_COMMAND_READ, ctrl])
//   var addr = this.bus.address
//
//   this.writePayload(payload, function(err) {
//     if (err) { return callback(err); }
//     _.delay(function() {
//       this.bus.readByte(function(err, ack) {
//         if (err) { return callback(err); }
//         debug('response ack: ' + ack.toString(16))
//         if (ack !== addr << 1) {
//           return callback(ReadError({title: "ACK invalid"}))
//         }
//         this.bus.readByte(function(err, data_length_raw) {
//           if (err) { return callback(err); }
//           debug('response length byte: ' + data_length_raw.toString(16))
//           var data_length = data_length_raw & (~MAGIC_2)
//           debug('response length: ' + data_length.toString(16))
//           debug('bus history')
//           debug(this.bus.history)
//           this.bus.read(data_length + 1, function(err, data_raw) {
//             if (err) { return callback(err); }
//             var data = data_raw.slice(0, data_raw.length - 1)
//             var checksum = data_raw[data_raw.length - 1]
//
//             debug('response: ' + data_raw.map(function(b) {return b.toString(16)}).join(' '))
//
//             var xor = (addr << 1 | 1) ^ MAGIC_1 ^ (MAGIC_2 | data.length)
//
//             xor = calculateChecksum(data, xor)
//
//             if (xor != checksum) {
//               return callback(ReadError({title: "Invalid checksum"}))
//             }
//
//             if (data[0] != DDCCI_REPLY_READ) {
//               return callback(ReadError({title: "Invalid response type"}))
//             }
//
//             if (data[2] != ctrl) {
//               return callback(ReadError({title: "Received data for unrequested control"}))
//             }
//
//             var max_value = data[4] << 8 | data[5]
//             var value = data[6] << 8 | data[7]
//
//             if (extended) {
//               callback(null, [value, max_value])
//             } else {
//               callback(null, value)
//             }
//           }.bind(this))
//         }.bind(this))
//       }.bind(this))
//     }.bind(this))
//   }.bind(this), READ_DELAY)
// }

// DDCCIDevice.prototype.control_property(ctrl):
//     """helper for adding control properties (see demo)"""
//     return property(lambda s: s.read(ctrl),
//                     lambda s, v: s.write(ctrl, v))
//
// brightness = control_property(0x10)
// contrast = control_property(0x12)

DDCCIDevice.prototype.writePayload = rateLimit(function(payload, callback) {
  this.bus.write(payload, callback)
}, WRITE_DELAY)

DDCCIDevice.prototype.preparePayload = function(data) {
  var addr = this.bus.address
  var payload = [MAGIC_1, MAGIC_2 | data.length]
  var xor

  if (data[0] === DDCCI_COMMAND_READ) {
    xor = addr << 1 | 1
  } else {
    xor = addr << 1
  }

  payload.push.apply(payload, data)

  xor = calculateChecksum(payload, xor)

  payload.push(xor)
  debug('payload: ' + payload.map(function(b) {return b.toString(16)}).join(' '))
  return payload
}
if (require.main === module) {
  // You can obtain your bus id using `i2cdetect -l` or `ddccontrol -p`
  d = DDCCIDevice(0)

  console.log('Demo 1 ...')
  // d.read(0x41, function(err, res) {
  //   console.log(err && err.stack, res)
  //   if(err) { return }

    d.write(0x41, 17, function(err, res) {
      console.log(err && err.stack, res)
    })
  // })
}
