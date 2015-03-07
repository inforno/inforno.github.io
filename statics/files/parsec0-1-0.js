/**
 * Copyright (c) 2007, Yusuke Inuzuka<yuin@inforno.net>(http://inforno.net/)
 *
 * License :
 *   Articstic License 2.0
 */

try{Inforno}catch(e){ Inforno = {}; }
Inforno.Parsec = {
  VERSION : "0.1.0",
  extend : function(dest, src) { for(i in src){dest[i] = src[i];} return dest; },
  inherit: function(child, parent) {
    this.extend(child, parent);
    var dummy = function(){};
    dummy.prototype = parent.prototype;
    child.prototype = new dummy();
    child.prototype.constructor = child;
    child.prototype.__super__ = parent.prototype;
    return child;
  }
}


new function(){
/****************************************************************/
var $ = Inforno.Parsec;
/*********************************************
 * Parser
 *********************************************/
var P = $.Parser = function(){};
P.create = function(parse) {
  var p = new P;
  p.parse = parse;
  return p;
}
$.extend(P.prototype, {
  parse : function(s){ throw "abstract"; },

  $ : function(q) {
    var self = this;
    return P.create(function(s){var m = self.parse(s);switch(m.type){
      case ST.FAIL    : return m;
      case ST.SUCCESS : 
        if(q.constructor == Function) {
          return $.extend(m.clone(), {result:[q.apply({},m.result)]});
        }
        var m2 = q.parse(m);
        switch(m2.type) {
          case ST.FAIL    : return m2;
          case ST.SUCCESS :
            m2.result = m.result.concat(m2.result);
            return m2;
        }
    }});
  },

  l : function(q) {
    var self = this;
    return P.create(function(s){var m = self.parse(s);switch(m.type){
      case ST.FAIL : var m2 = q.parse(s);
        switch(m2.type) {
          case ST.FAIL    : return (m2.pos < m2.pre.pos) ? m : m2;
          case ST.SUCCESS : return m2;
        }
      default : return m;
    }});
  },

  retval : function(v) {
    return this.ret(function(){return v;});
  }

});
P.prototype.follow = P.prototype.ret = P.prototype.$;
/*********************************************
 * ParseState
 *********************************************/
var ST = $.ParseState = function() {
  $.extend(this, {pos :0,line:1,linepos:1,result:[], type:ST.SUCCESS, pre:{}});
}
$.extend(ST, {FAIL:0,SUCCESS:1});
$.extend(ST.prototype, {
  fail     : function(){return this.type == ST.FAIL;},
  success  : function(){return !this.fail();},
  clone : function() {
    var s =new ST;
    for(var i in this){
      if(this[i].constructor==Array) s[i] = this[i].slice();
      else s[i] = this[i];
    }
    return s;
  }
});
/*********************************************
 * Parsers
 *********************************************/
var PS = $.Parsers = function(str) {
  this.state = null;
  var self   = this;
  this._chrLike = function(p) {
    return P.create(function(pre){
      if(!pre) pre = new ST;
      self.state = pre.clone();
      self.state.pre = pre;
      var c = str.charAt(self.state.pos);
      if(self.state.pos <= str.length && p(c)) {
        if(c=="\n") self.state.line++;
        $.extend(self.state, {pos:self.state.pos+1,linepos:self.state.linepos+1,
                              type:ST.SUCCESS, result:[c]});
        return self.state;
      }else{
        self.state.type=ST.FAIL;
        return self.state;
      }
    });
  };
  this.empty = P.create(function(state) {
    return $.extend(self.state, {result:[""], type:ST.SUCCESS});
  });
  this.any = this.chrLike(function(c){return true;});
  this.eof = this.chrLike(function(c){return c=="";});
}
$.extend(PS, {
  define : function(f) {
    var ps = function(s){
      this.__super__.constructor.call(this, s);
      f.call(this);
    }
    $.inherit(ps, PS);
    return ps;
  },

  _many : function(f) {
    return function(p){
        var self = this;
        return P.create(function(s) {
          var current = p.parse(s);
          if(current.type==ST.FAIL) return f(current);
          var result = [current.result];
          while(1){
            var next = p.parse(current);
            switch(next.type) {
              case ST.FAIL     : current.result = [result];
                                 return current;
              case ST.SUCCESS  : result.push(next.result);
                                 current = next;
            }
          }
        });
      }
  },
});

$.extend(PS.prototype, {
  Return : {
    str : function(){
      var result = [];
      for(var i=0,l=arguments.length;i<l;i++) {
        if(arguments[i]) {
          if(arguments[i].constructor == Array) {
            result.push(arguments.callee.apply({},arguments[i]));
          }else {
            result.push(arguments[i]);
          }
        }
      }
      return result.join("");
    },
  },
  p : function(name) {
    var self=this;
    return P.create(function(s) {
      return self[name].parse(s);
    });
  },

  chrLike : function(f){var self=this; return this._chrLike(f).ret(self.Return.str);},
  chr     : function(c){ return this.chrLike(function(v){return v==c;});},
  str     : function(str) {
    var cs = str.split("");
    var p  = this.chr(cs[0]);
    for(var i=1,l=cs.length;i<l;i++) {
      p = p .$ (this.chr(cs[i]));
    }
    return p.ret(this.Return.str);
  },
  fail   : P.create(function(s){return $.extend(s,{type:ST.FAIL})}),
  option : function(p){return p .l (this.empty);},
  many1  : PS._many(function(s){return $.extend(s,{type:ST.FAIL})}),
  many   : PS._many(function(s){return $.extend(s,{type:ST.SUCCESS, result:[]});}),
  sepBy1  : function(p, s, igoreSep) {
    return (p) .$ (this.many(
      (s) .$ (p) .ret(function(r1, r2) {
        return (igoreSep) ? r2 : [r1, r2];
      })
    )) .ret(function(r1, r2){
      if(!r2) r2=[];
      r2.unshift(r1);
      return r2;
    });
  },
  sepBy   : function(p, s, i){return this.option(this.sepBy1(p,s,i));},
  between : function(open, p, close) {
    return ((open) .$ (p) .$ (close)) .ret(function(o,c,p){return c;});
  },
  chainl1 : function(p,q) {
    return  (p) .$ (this.many((q) .$ (p)))  .ret(function(x, _xs) {
      var result = x;
      var xs = _xs || [];
      for(var i=0,l=xs.length; i<l; i++) result = xs[i][0](result, xs[i][1]);
      return result;
    });
  },
  chainr1 : function(p,q){
    return  (p) .$ (this.many((q) .$ (p)))  .ret(function(x, _xs) {
      var xs = _xs || [];
      xs.unshift([function(){}, x]);
      var result = xs[xs.length-1][1];
      for(var i=xs.length-1; i>0; i--) result = xs[i][0](xs[i-1][1],result);
      return result;
    });
  }
});
/****************************************************************/
}
