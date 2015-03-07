/**
 * Copyright (c) 2007, Yusuke Inuzuka<yuin@inforno.net>(http://inforno.net/)
 *
 * License :
 *   Articstic License 2.0
 */
try{Inforno}catch(e){ Inforno = {}; }
Inforno.Parsec = {
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

  and : function(q) {
    var self = this;
    return P.create(function(s){var m = self.parse(s);switch(m.type){
      case "fail"    : return m;
      case "success" : 
        if(q.constructor == Function) {
          return $.extend(m.clone(), {result:[q.apply({},m.result)]});
        }
        var m2 = q.parse(m);
        switch(m2.type) {
          case "fail"    : return m2;
          case "success" :
            m2.result = m.result.concat(m2.result);
            return m2;
        }
    }});
  },

  or : function(q) {
    var self = this;
    return P.create(function(s){var m = self.parse(s);switch(m.type){
      case "fail" : var m2 = q.parse(s);
        switch(m2.type) {
          case "fail"    : if(m2.pos < m2.pre.pos) return m;
                           else                    return m2;
          case "success" : return m2;
        }
      default : return m;
    }});
  }
});
P.prototype.ret = P.prototype.and;
/*********************************************
 * ParseState
 *********************************************/
var ST = $.ParseState = function() {
  $.extend(this, {pos :0,result:[], type:"success", pre:{}});
}
$.extend(ST.prototype, {
  fail     : function(){return this.type == "fail";},
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
        $.extend(self.state, {pos:self.state.pos+1, type:"success", result:[c]});
        return self.state;
      }else{
        self.state.type="fail";
        return self.state;
      }
    });
  };
  this.empty = P.create(function(state) {
    return $.extend(self.state, {result:[""], type:"success"});
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

  _rep : function(f) {
    return function(p){
        var self = this;
        return P.create(function(s) {
          var current = p.parse(s);
          if(current.type=="fail") return f(current);
          var result = [current.result];
          while(1){
            var next = p.parse(current);
            switch(next.type) {
              case "fail"     : current.result = [result];
                                return current;
              case "success"  : result.push(next.result);
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

  chrLike : function(f){var self=this; return this._chrLike(f).ret(self.Return.str);},
  chr     : function(c){ return this.chrLike(function(v){return v==c;});},
  str     : function(str) {
    var cs = str.split("");
    var p  = this.chr(cs[0]);
    for(var i=1,l=cs.length;i<l;i++) {
      p = p.and(this.chr(cs[i]));
    }
    return p.ret(this.Return.str);
  },
  fail  : P.create(function(s){return $.extend(s,{type:"fail"})}),
  opt   : function(p){return p.or(this.empty);},
  rep1  : PS._rep(function(s){return $.extend(s,{type:"fail"})}),
  rep   : PS._rep(function(s){return $.extend(s,{type:"success", result:[]});}),
  sep1  : function(p, s, igoreSep) {
    return (p) .and (this.rep(
      (s) .and (p) .ret(function(r1, r2) {
        if(igoreSep) return r2;
        return [r1, r2];
      })
    )) .ret(function(r1, r2){
      if(!r2) r2=[];
      r2.unshift(r1);
      return r2;
    });
  },
  sep   : function(p, s, i){return this.opt(this.sep1(p,s,i));}
});
/****************************************************************/
}
