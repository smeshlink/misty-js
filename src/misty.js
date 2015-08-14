/*!
 * Misty JavaScript Library v0.9.1
 *
 * Copyright 2009, 2014 SmeshLink Technology Co., Ltd.
 *
 * Date: 2014-05-20
 */
(function(window, $, undefined) {
"use strict";

var
  // Use the correct document accordingly with window argument (sandbox)
  document = window.document,
  location = window.location,

  // In some environment, console is defined but console.log or console.error is missing.
  console = (window.console && window.console.log && window.console.error)
    ? window.console : { log: function() { }, error: function() { } },

  // Default api host
  _apiHost = 'api.misty.smeshlink.com',
  _dataType = 'json',
  _version = '1.0.0',
  _verbose = true,
  protocol = function() { return document.location.protocol === "https:" ? "https:" : "http:"; },

  /* helpers */
  basicAuth = function(user, pwd) {
    return "Basic " + window.btoa(user + ':' + pwd);
  },

  execute = function(arr) {
    if (typeof arr === 'function') {
      arr.apply(this, Array.prototype.slice.call(arguments, 1));
    } else if (Object.prototype.toString.apply(arr) === '[object Array]') {
      var x = arr.length;
      while (x--) {
        arr[x].apply(this, Array.prototype.slice.call(arguments, 1));
      }
    }
  },

  coerceToLocal = function(date) {
    return new Date(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
      date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(),
      date.getUTCMilliseconds()
    );
  },

  fromDateTime8601 = function(str, utcMode) {
    if (typeof str === 'number')
      return new Date(str * 1000);
    var m = str.match(/^(\d{4})(-(\d{2})(-(\d{2})([T ](\d{2}):(\d{2})(:(\d{2})(\.(\d+))?)?(Z|(([-+])(\d{2})(:?(\d{2}))?))?)?)?)?$/);
    if (m) {
      var d = new Date(Date.UTC(
        m[1],
        m[3] ? m[3] - 1 : 0,
        m[5] || 1,
        m[7] || 0,
        m[8] || 0,
        m[10] || 0,
        m[12] ? Number('0.' + m[12]) * 1000 : 0
      ));
      if (m[13]) { // has gmt offset or Z
        if (m[14]) { // has gmt offset
          d.setUTCMinutes(
            d.getUTCMinutes() +
            (m[15] == '-' ? 1 : -1) * (Number(m[16]) * 60 + (m[18] ? Number(m[18]) : 0))
          );
        }
      } else { // no specified timezone
        if (!utcMode) {
          d = coerceToLocal(d);
        }
      }
      return d;
    }
  },
  
  leadingZero = function(n) {
    return n < 10 ? '0' + n : n;
  },
  
  toDateTime8601 = function(date) {
    var year = new String(date.getFullYear()),
      month = leadingZero(date.getMonth() + 1),
      day = leadingZero(date.getDate()),
      time = leadingZero(date.getHours())
        + ":" + leadingZero(date.getMinutes())
        + ":" + leadingZero(date.getSeconds());
    return year + '-' + month + '-' + day + "T" + time;
  },

  indexOf = Array.indexOf || function(array, item, i) {
    i || (i = 0);
    var length = array.length;
    if (i < 0) i = length + i;
    for (; i < length; i++)
    if (array[i] === item) return i;
    return -1;
  },

  /* formatters */
  formatters = {
    'xml': (function() {
      var
        getInnerText = function(node) {
          if ('#text' == node.nodeName)
            return node.nodeValue;
          else if (node.childNodes.length > 0)
            return node.childNodes[0].nodeValue;
        },

        getChildElement = function(node) {
          for (var i = 0; i < node.childNodes.length; i++) {
            if (node.childNodes[i].nodeName != "#text")
              return node.childNodes[i];
          }
          return null;
        },
        
        parseKey = function(node) {
          var at = node.getAttribute('at');
          return at ? fromDateTime8601(at) : node.getAttribute('key');
        },

        parseValue = function(node) {
          var val;
          
          if ('value' == node.tagName || 'array' == node.tagName) {
            val = parseValue(getChildElement(node));
          } else if ('number' == node.tagName || 'integer' == node.tagName) {
            val = Number(node.childNodes[0].nodeValue);
          } else if ('string' == node.tagName) {
            val = node.childNodes.length > 0 ? node.childNodes[0].nodeValue : '';
          } else if ('base64' == node.tagName) {
            // TODO decode bytes
          } else if ('struct' == node.tagName) {
            val = {};
            for (var i = 0; i < node.childNodes.length; i++) {
              var child = node.childNodes[i];
              if ('member' == child.nodeName) {
                var mName, mValue;
                for (var j = 0; j < child.childNodes.length; j++) {
                  var n = child.childNodes[j];
                  if ('name' == n.nodeName)
                    mName = n.childNodes[0].nodeValue;
                  else if ('value' == n.nodeName)
                    mValue = parseValue(n);
                }
                val[mName] = mValue;
              }
            }
          } else if ('data' == node.tagName) {
            val = [];
            for (var i = 0; i < node.childNodes.length; i++) {
              if (node.childNodes[i].nodeName != "#text") {
                var tmp = parseValue(node.childNodes[i]);
                if (tmp)
                  val.push(tmp);
              }
            }
          }
          
          return val;
        },

        parseFeedNode = function(feedNode) {
          if ('feed' != feedNode.tagName)
            return;
          var feed = {};
          for (var i = 0; i < feedNode.childNodes.length; i++) {
            var node = feedNode.childNodes[i];
            if ('name' == node.tagName) {
              feed.name = getInnerText(node);
            } else if ('created' == node.tagName) {
              feed.created = fromDateTime8601(getInnerText(node));
            } else if ('updated' == node.tagName) {
              feed.updated = fromDateTime8601(getInnerText(node));
            } else if ('children' == node.tagName) {
              feed.children = [];
              for (var j = 0; j < node.childNodes.length; j++) {
                var child = parseFeedNode(node.childNodes[j]);
                if (child)
                  feed.children.push(child);
              }
            } else if ('current' == node.tagName) {
              feed.current = parseValue(getChildElement(node));
            } else if ('data' == node.tagName) {
              feed.data = [];
              for (var j = 0; j < node.childNodes.length; j++) {
                var entry = node.childNodes[j];
                if ('entry' == entry.tagName) {
                  var value = parseValue(getChildElement(entry));
                  if (value != undefined)
                    feed.data.push({ key: parseKey(entry), value: value });
                }
              }
            } else if ('tag' == node.tagName) {
              feed.tags ? feed.tags.push(getInnerText(node)) : (feed.tags = [ getInnerText(node) ]);
            } else if ('location' == node.tagName) {
              feed.location = {
                domain      : node.getAttribute('domain'),
                disposition : node.getAttribute('disposition'),
                exposure    : node.getAttribute('exposure')
              };
              for (var j = 0; j < node.childNodes.length; j++) {
                var childNode = node.childNodes[j];
                if ('name' == childNode.tagName) {
                  feed.location.name = getInnerText(childNode);
                } else if ('waypoints' == childNode.tagName) {
                  feed.location.waypoints = [];
                  for (var k = 0; k < childNode.childNodes.length; k++) {
                    var wpNode = childNode.childNodes[k], wp = {};
                    for (var attrIndex in wpNode.attributes) {
                      var attr = wpNode.attributes[attrIndex];
                      if ('at' == attr.name) {
                        wp[attr.name] = fromDateTime8601(attr.value);
                      } else {
                        wp[attr.name] = Number(attr.value);
                      }
                    }
                    feed.location.waypoints.push(wp);
                  }
                } else {
                  feed.location[childNode.tagName] = Number(getInnerText(childNode));
                }
              }
            } else if ('unit' == node.tagName) {
              feed.unit = {
                label  : getInnerText(node),
                symbol : node.getAttribute('symbol'),
                type   : node.getAttribute('type')
              };
            } else {
              feed[node.tagName] = getInnerText(node);
            }
          }
          return feed;
        },
        
        f = function() {
        };

      f.prototype = {
        parseFeeds: function(doc) {
          var feeds = [];
          var nodes = doc.documentElement.childNodes;
          for (var i = 0; i < nodes.length; i++) {
            if ('feed' == nodes[i].tagName) {
              var feed = parseFeedNode(nodes[i]);
              if (feed)
                feeds.push(feed);
            }
          }
          return feeds;
        },
        parseFeed: function(doc) {
          var feeds = this.parseFeeds(doc);
          return feeds.length > 0 ? feeds[0] : null;
        }
      };
      
      return new f();
    })(),
    'json': {
      parseFeeds: function(data) {
        var ret = data.results || [];
        ret.totalResults = data.totalResults;
        ret.startIndex = data.startIndex;
        ret.itemsPerPage = data.itemsPerPage;
        return ret;
      },
      parseFeed: function(data) {
        return $.isArray(data.results) ? (data.results.length > 0 ? data.results[0] : null) : data;
      },
      format: function(data) {
        // TODO better idea for compatibility?
        return JSON.stringify(data);
      }
    }
  },
  
  /* channels */
  HttpChannel = function(apiHost) {
    var
      apiEndpoint = protocol() + '//' + apiHost,

      ajax = function(options) {
        var opts = $.extend({
          type: 'GET'
        }, options);
        
        if (!opts.url)
          return;
        
        var headers = opts.headers;
        
        if (!headers)
          return console.log('(MistyJS) :: WARN :: No API key :: Set your API key first before calling any method.');
        
        opts.type = opts.type.toUpperCase();
        
        if (opts.type === 'PUT' || opts.type === 'POST') {
          if (!opts.data || typeof opts.data !== 'object') {
            return;
          } else {
            opts.data = formatters[opts.dataType].format(opts.data);
          }
        }
        
        $.ajax({
          url         : opts.url,
          type        : opts.type,
          headers     : headers,
          data        : opts.data,
          dataType    : opts.dataType,
          // failed on IE
          //crossDomain : true,
          cache       : true
        })
        .done(opts.done)
        .fail(opts.fail)
        .always(opts.always);
      };

    this.endpoint = function(uri) {
      if (uri)
        apiEndpoint = uri.startsWith('http:') || uri.startsWith('https:') ? uri : (protocol() + '//' + uri);
      return apiEndpoint;
    };

    this.send = function(request, done, fail, always) {
      if (!request) return;
      if (request.method && request.method.toUpperCase() == 'CMD') {
        request.method = 'POST';
        request.resource = request.resource.replace(/\/\w+\//, '/command/');
      }
      ajax({
        type     : request.method,
        url      : apiEndpoint + request.resource + (request.format ? ('.' + request.format) : ''),
        headers  : request.headers,
        data     : request.data || request.params || request.body,
        dataType : request.format,
        done     : done,
        fail     : function(jqXHR, textStatus, errorThrown)
          { fail && fail(jqXHR.status, textStatus, errorThrown); },
        always   : always
      });
    };
  },
  
  WebSocketChannel = function(socketEndpoint, trigger) {
    var
      ws = this,
      socket = false,
      socketReady = false,
      queue = [],
      token = 0,
      reconnectInterval = 3000,
      waitingRequests = {},
      
      send = function(message) {
        console.log(message);
        if (typeof message === 'object')
          message = JSON.stringify(message);
        if (!socketReady) {
          connect();
          queue.push(function() {
            socket.send(message);
          });
        } else {
          socket.send(message);
        }
      },
    
    connect = function(callback) {
      var WebSocket = (window.WebSocket || window.MozWebSocket);

      if (!socket && WebSocket) {
        socket = new WebSocket(socketEndpoint);
        
        socket.onerror = function(e) {
          ws.onerror && ws.onerror(e, this);
        };
        
        socket.onclose = function(e) {
          ws.onclose && ws.onclose(e, this);
          socket = false;
          setTimeout(function() {
            connect()
          }, reconnectInterval);
        };
        
        socket.onopen = function(e) {
          socketReady = true;
          ws.onopen && ws.onopen(e, this);
          queue.length && execute(queue);
          callback && callback(this);
        };
        
        socket.onmessage = function(e) {
          var response = $.parseJSON(e.data);
          console.log(response);
          var waiting = waitingRequests[response.token];
          if (waiting) {
            waitingRequests[response.token] = undefined;
            if (response.status < 300)
              waiting.done && waiting.done(response.body);
            else
              waiting.fail && waiting.fail(response.status);
            waiting.always && waiting.always();
            return;
          }
          if (response.body) {
            ws.ondata && ws.ondata(response);
            trigger('misty.' + response.resource, response.body);
          }
        };
      }
    };
    
    this.reconnectInterval = function(i) {
      if (i) reconnectInterval = i;
      return reconnectInterval;
    };
    
    this.send = function(request, done, fail, always) {
      if (!request) return;
      if (!request.headers)
          return console.log('(MistyJS) :: WARN :: No API key :: Set your API key first before calling any method.');
      request.headers['User-Agent'] = 'MistyJS/' + _version;
      if (!request.method) request.method = 'GET';
      if (!request.token) request.token = token++;
      if (!request.body && request.data) {
        request.body = request.data;
        delete request.data;
      }
      waitingRequests[request.token] = { request: request, done: done, fail: fail, always: always };
      send(request);
    };
  },

  /* Misty object */

  Misty = function(apiHost, dataType) {
    apiHost = apiHost || _apiHost;
    dataType = dataType || _dataType;
    
    var
      misty = this,
      apiKey,
      
      events = {},
      on = function(e, handler) {
        var handlers = events[e];
        if (!handlers)
          events[e] = handlers = [];
        handlers[handlers.length] = handler;
      },
      trigger = function(e, data) {
        var handlers = events[e];
        if (handlers) {
          for (var i in handlers) {
            handlers[i](data);
          }
        }
      },
      
      socketEndpoint = (protocol() === 'https:' ? 'wss:' : 'ws:') + apiHost + ':9010',
      preferHTTP = true,
      _http, _ws,
      resources = [],
      
      authHeaders = function() {
        if (misty.username && misty.password)
          return { 'Authorization' : basicAuth(misty.username, misty.password) };
        else if (apiKey)
          return { 'X-ApiKey' : apiKey };
      };
    
    this.apiKey = function(key) {
      if (key)
        apiKey = key;
    };
    this.dataType = function(type) {
      if (type)
        dataType = type;
      return dataType;
    };
    this.apiEndpoint = function(uri) {
      return misty.http().endpoint(uri);
    };
    this.socketEndpoint = function(uri) {
      if (uri)
        socketEndpoint = uri;
      return socketEndpoint;
    };
    
    this.http = function() {
      if (_http)
        return _http;
      return _http = new HttpChannel(apiHost);
    };
    
    this.socket = function() {
      if (_ws)
        return _ws;
      return _ws = new WebSocketChannel(socketEndpoint, trigger);
    };
    
    this.preferHTTP = function(b) {
      if (typeof b !== 'undefined') {
        preferHTTP = !!b;
        if (!preferHTTP) this.dataType('json');
      }
      return preferHTTP;
    };
    
    var channel = function() {
      return preferHTTP ? misty.http() : misty.socket();
    };
    
    var subscribe = function(resource, callback) {
      if (indexOf(resources, resource) < 0) {
        resources.push(resource);
        misty.socket().send({
          method   : 'subscribe',
          headers  : authHeaders(),
          resource : resource
        });
      }
      
      if (callback && typeof callback === 'function') {
        on('misty.' + resource, callback);
      }
    };
    
    var unsubscribe = function(resource) {
      var index = indexOf(resources, resource);
      if (index >= 0) {
        resources.splice(index, 1);
        misty.socket().send({
          method   : 'unsubscribe',
          headers  : authHeaders(),
          resource : resource
        });
      }
    };
    
    var command = function(resource, cmd, callback) {
      channel().send({
        method   : 'cmd',
        resource : resource,
        headers  : authHeaders(),
        data     : cmd
      }, function(data) {
        callback && callback(data);
      }, function(status) {
        callback && callback(undefined, status);
      });
    };
    
    var FeedService = function(ctx) {
      ctx = ctx && ctx.trim();
      this.ctx = !ctx ? '/feeds' : (ctx[0] == '/' ? ctx : ('/' + ctx));
    };
    var EntryService = function(ctx) {
      this.ctx = ctx;
    };
    
    FeedService.prototype = {
      list : function(options, callback) {
        if (typeof options === 'function') {
          callback = options;
          options = undefined;
        }
        channel().send({
          headers  : authHeaders(),
          resource : this.ctx,
          params     : options,
          format   : dataType,
        }, function(data) {
          callback && callback(formatters[dataType].parseFeeds(data));
        }, function(status, textStatus, errorThrown) {
          callback && callback(undefined, status, textStatus, errorThrown);
        });
      },
      
      find : function(path, options, callback) {
        if (typeof path !== 'string') {
          callback = options;
          options = path;
          path = undefined;
          if (typeof options === 'function') {
            callback = options;
            options = undefined;
          }
        }
        channel().send({
          headers  : authHeaders(),
          resource : this.ctx + '/' + path,
          params     : options,
          format   : dataType,
        }, function(data) {
          callback && callback(formatters[dataType].parseFeed(data));
        }, function(status, textStatus, errorThrown) {
          callback && callback(undefined, status, textStatus, errorThrown);
        });
      },
      
      update : function(feed, callback) {
        var path = feed.name ? ('/' + feed.name) : '';
        channel().send({
          method   : 'PUT',
          headers  : authHeaders(),
          resource : this.ctx + path,
          data     : data,
          format   : dataType,
        }, function(data) {
          callback && callback(true);
        }, function(status, textStatus, errorThrown) {
          callback && callback(false, status, textStatus, errorThrown);
        });
      },
      
      'new' : function(feed, callback) {
        channel().send({
          method   : 'POST',
          headers  : authHeaders(),
          resource : this.ctx,
          data     : feed,
          format   : dataType,
        }, function(data) {
          callback && callback(true);
        }, function(status, textStatus, errorThrown) {
          callback && callback(false, status, textStatus, errorThrown);
        });
      },
      
      'delete' : function(path, callback) {
        channel().send({
          method   : 'DELETE',
          headers  : authHeaders(),
          resource : this.ctx + '/' + path,
        }, function(data) {
          callback && callback(true);
        }, function(status, textStatus, errorThrown) {
          callback && callback(false, status, textStatus, errorThrown);
        });
      },
      
      subscribe : function(path, callback) {
        if (typeof path === 'function') {
          callback = path;
          path = undefined;
        }
        path = path ? (this.ctx + '/' + path) : this.ctx;
        subscribe(path, callback);
      },
      
      unsubscribe : function(path) {
        if (typeof path === 'function') {
          callback = path;
          path = undefined;
        }
        path = path ? (this.ctx + '/' + path) : this.ctx;
        unsubscribe(path);
      },
      
      command : function(path, cmd, callback) {
        if (typeof cmd === 'function') {
          callback = cmd;
          cmd = path;
          path = undefined;
        }
        path = path ? (this.ctx + '/' + path) : this.ctx;
        command(path, cmd, callback);
      },
      
      feed : function(path) {
        return path ? new FeedService(this.ctx + '/' + path) : this;
      },
      
      entry : function(path) {
        return new EntryService(this.ctx + '/' + path);
      }
    };
    
    EntryService.prototype = {
      find : function(key, callback) {
        channel().send({
          headers  : authHeaders(),
          resource : this.ctx + '@' + key + '.' + dataType,
        }, function(data) {
          callback && callback(formatters[dataType].parseEntry(data));
        }, function(status, textStatus, errorThrown) {
          callback && callback(undefined, status, textStatus, errorThrown);
        });
      }
    };
    
    this.user = function(creator) {
      return new FeedService(creator);
    };
    this.feed = function(parent) {
      parent = (parent && parent.trim()) || '';
      return new FeedService('/feeds' + (!parent || parent[0] == '/' ? parent : ('/' + parent)));
    };
    this.entry = function(creator, path) {
      if (typeof path === 'undefined') {
        path = creator;
        creator = undefined;
      }
      return misty.feed(creator).entry(path);
    };
    this.subscribe = function(creator, feed, callback) {
      if (!feed || typeof feed === 'function') {
        callback = feed;
        feed = creator;
        creator = undefined;
      }
      misty.user(creator).subscribe(feed, callback);
    };
    this.unsubscribe = function(creator, feed, callback) {
      if (!feed || typeof feed === 'function') {
        callback = feed;
        feed = creator;
        creator = undefined;
      }
      misty.user(creator).unsubscribe(feed);
    };
    this.command = function(feed, callback) {
      misty.feed().command(feed, callback);
    };
  };

Misty.prototype = {
  version: _version,

  fromDateTime8601: fromDateTime8601,
  
  toDateTime8601: toDateTime8601,

  signIn: function(user, pwd, done, fail) {
    if (typeof user === 'function') {
      done = user;
      user = undefined;
    }
    if (typeof pwd === 'function') {
      fail = pwd;
      pwd = undefined;
    }
    
    if (user || pwd) {
      this.username = user;
      this.password = pwd;
    }
    
    done && done();
  },

  signOut: function() {
    this.username = this.password = undefined;
  }
};

// Expose Misty to the global object
window.Misty = Misty;
window.misty = new Misty();

})(window, jQuery);

if (typeof window.btoa == 'undefined' || typeof window.atob == 'undefined') {
  var Base64 = {
    // private property
    _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
   
    // public method for encoding
    encode : function (input) {
      var output = "";
      var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
      var i = 0;
   
      input = Base64._utf8_encode(input);
   
      while (i < input.length) {
   
        chr1 = input.charCodeAt(i++);
        chr2 = input.charCodeAt(i++);
        chr3 = input.charCodeAt(i++);
   
        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;
   
        if (isNaN(chr2)) {
          enc3 = enc4 = 64;
        } else if (isNaN(chr3)) {
          enc4 = 64;
        }
   
        output = output +
        this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
        this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
   
      }
   
      return output;
    },
    
    decodeString : function (input) {
      var output = "";
      var out = Base64.decode(input);

      while (out.length > 0) {
        output += String.fromCharCode(out.shift());
      }

      output = Base64._utf8_decode(output);

      return output;
    },
   
    // public method for decoding
    decode : function (input) {
      var out = Array();
      var chr1, chr2, chr3;
      var enc1, enc2, enc3, enc4;
      var i = 0;
   
      input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
   
      while (i < input.length) {
        enc1 = this._keyStr.indexOf(input.charAt(i++));
        enc2 = this._keyStr.indexOf(input.charAt(i++));
        enc3 = this._keyStr.indexOf(input.charAt(i++));
        enc4 = this._keyStr.indexOf(input.charAt(i++));
   
        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;
   
        out.push(chr1);
        if (enc3 != 64)
          out.push(chr2)
        if (enc4 != 64)
          out.push(chr3);
      }
   
      return out;
    },
   
    // private method for UTF-8 encoding
    _utf8_encode : function (string) {
      string = string.replace(/\r\n/g,"\n");
      var utftext = "";
   
      for (var n = 0; n < string.length; n++) {
   
        var c = string.charCodeAt(n);
   
        if (c < 128) {
          utftext += String.fromCharCode(c);
        }
        else if((c > 127) && (c < 2048)) {
          utftext += String.fromCharCode((c >> 6) | 192);
          utftext += String.fromCharCode((c & 63) | 128);
        }
        else {
          utftext += String.fromCharCode((c >> 12) | 224);
          utftext += String.fromCharCode(((c >> 6) & 63) | 128);
          utftext += String.fromCharCode((c & 63) | 128);
        }
   
      }
   
      return utftext;
    },
   
    // private method for UTF-8 decoding
    _utf8_decode : function (utftext) {
      var string = "";
      var i = 0;
      var c = c1 = c2 = 0;
   
      while ( i < utftext.length ) {
   
        c = utftext.charCodeAt(i);
   
        if (c < 128) {
          string += String.fromCharCode(c);
          i++;
        }
        else if((c > 191) && (c < 224)) {
          c2 = utftext.charCodeAt(i+1);
          string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
          i += 2;
        }
        else {
          c2 = utftext.charCodeAt(i+1);
          c3 = utftext.charCodeAt(i+2);
          string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
          i += 3;
        }
   
      }
   
      return string;
    }
  };
  window.btoa = function(input) { return Base64.encode(input); };
  window.atob = function(input) { return Base64.decode(input); };
}
