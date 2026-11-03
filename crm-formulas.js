/* NexaBridge Sheets Studio: independent, sandboxed formula evaluator.
   No eval(), Function(), external references or network formulas.
   Supports common spreadsheet expressions; NOT Google Sheets' complete formula language. */
(function(global){
 'use strict';
 const ERR={ref:'#REF!',div:'#DIV/0!',cycle:'#CYCLE!',name:'#NAME?',value:'#VALUE!',parse:'#ERROR!'};
 function colIndex(letters){let n=0;for(const c of String(letters).toUpperCase()){if(c<'A'||c>'Z')return -1;n=n*26+c.charCodeAt(0)-64;}return n-1}
 function colName(index){let n=index+1,s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
 function address(row,col){return colName(col)+(row+1)}
 function coordinates(v){const m=/^\$?([A-Z]{1,3})\$?([1-9]\d{0,4})$/i.exec(String(v));if(!m)return null;const col=colIndex(m[1]),row=Number(m[2])-1;return col<0||col>=18278||row>=10000?null:{row,col}}
 function numeric(x){if(Array.isArray(x))return Number.NaN;if(typeof x==='boolean')return x?1:0;if(x==null||String(x).trim()==='')return 0;const n=Number(x);return Number.isFinite(n)?n:Number.NaN}
 function flatten(args){const all=[];for(const v of args)Array.isArray(v)?all.push(...flatten(v)):all.push(v);return all}
 function tokenize(src){
  const pattern=/\s*(>=|<=|<>|!=|[+\-*/^&(),:;=<>]|"(?:[^"]|"")*"|\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,4}|[A-Za-z_][A-Za-z0-9_.]*|\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/y;
  const tokens=[];let i=0;
  while(i<src.length){pattern.lastIndex=i;const m=pattern.exec(src);if(!m)throw Error(ERR.parse);tokens.push(m[1]);i=pattern.lastIndex;if(tokens.length>500)throw Error(ERR.parse)}
  return tokens;
 }
 class FormulaEngine{
  constructor(cells){this.cells=cells&&typeof cells.get==='function'&&typeof cells.has==='function'?cells:new Map(Object.entries(cells||{}));this.cache=new Map();this.depth=0}
  evaluateCell(addr,stack=new Set()){
   const key=String(addr).toUpperCase().replaceAll('$','');
   if(this.cache.has(key))return this.cache.get(key);
   if(stack.has(key))return ERR.cycle;
   if(stack.size>=60)return ERR.cycle;
   const entry=this.cells.get(key),raw=typeof entry==='object'&&entry!==null?entry.raw_value:entry;
   if(raw==null||raw==='')return '';
   if(typeof raw!=='string')return raw;
   if(raw[0]!=='=')return raw;
   stack.add(key);let result;
   try{result=this.evaluate(raw.slice(1),stack)}catch(e){result=/^#[A-Z0-9\/?!]+$/.test(e.message)?e.message:ERR.parse}
   stack.delete(key);this.cache.set(key,result);return result;
  }
  range(start,end,stack){
   const a=coordinates(start),b=coordinates(end);if(!a||!b)throw Error(ERR.ref);
   const top=Math.min(a.row,b.row),bottom=Math.max(a.row,b.row),left=Math.min(a.col,b.col),right=Math.max(a.col,b.col);
   if((bottom-top+1)*(right-left+1)>10000)throw Error(ERR.value);
   const rows=[];for(let r=top;r<=bottom;r++){const line=[];for(let c=left;c<=right;c++)line.push(this.evaluateCell(address(r,c),stack));rows.push(line)}
   return {matrix:rows,values:rows.flat()};
  }
  evaluate(src,stack=new Set()){
   const tokens=tokenize(src),self=this;let i=0;
   const peek=()=>tokens[i],eat=()=>tokens[i++],expect=v=>{if(eat()!==v)throw Error(ERR.parse)};
   function prim(){
    const v=eat();if(v==null)throw Error(ERR.parse);
    if(v==='('){const result=expr(0);expect(')');return result}
    if(v==='+'||v==='-'){const n=numeric(prim());if(!Number.isFinite(n))throw Error(ERR.value);return v==='-'?-n:n}
    if(/^"/.test(v))return v.slice(1,-1).replaceAll('""','"');
    if(/^\d/.test(v))return Number(v);
    if(/^[A-Za-z_$]/.test(v)){
     if(peek()==='('){
      eat();const args=[];if(peek()!==')'){do{args.push(expr(0));if(peek()!==','&&peek()!==';')break;eat()}while(peek()!=null)}
      expect(')');return self.func(v.toUpperCase(),args);
     }
     if(peek()===':'){eat();const end=eat();return self.range(v,end,stack)}
     if(v.toUpperCase()==='TRUE')return true;
     if(v.toUpperCase()==='FALSE')return false;
     if(coordinates(v))return self.evaluateCell(v,stack);
     throw Error(ERR.name);
    }
    throw Error(ERR.parse);
   }
   const prec={ '=':1,'<>':1,'!=':1,'>':1,'<':1,'>=':1,'<=':1,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5};
   function expr(min){
    let left=prim();
    while(peek()!=null&&prec[peek()]!==undefined&&prec[peek()]>=min){
     const op=eat(),priority=prec[op],right=expr(op==='^'?priority:priority+1);
     if(typeof left==='string'&&left[0]==='#')throw Error(left);
     if(typeof right==='string'&&right[0]==='#')throw Error(right);
     if(op==='&'){left=String(left??'')+String(right??'');continue}
     if(['=','<>','!=','>','<','>=','<='].includes(op)){
      const a=Number(left),b=Number(right);
      const l=Number.isFinite(a)&&Number.isFinite(b)?a:String(left).toLowerCase();
      const r=Number.isFinite(a)&&Number.isFinite(b)?b:String(right).toLowerCase();
      left=op==='='?l===r:op==='!='||op==='<>'?l!==r:op==='>'?l>r:op==='<'?l<r:op==='>='?l>=r:l<=r;continue;
     }
     const a=numeric(left),b=numeric(right);
     if(!Number.isFinite(a)||!Number.isFinite(b))throw Error(ERR.value);
     left=op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:op==='/'?(b===0?ERR.div:a/b):Math.pow(a,b);
    }
    return left;
   }
   const output=expr(0);if(i!==tokens.length)throw Error(ERR.parse);
   return output;
  }
  func(name,args){
   const vals=flatten(args.map(v=>v&&v.matrix?v.values:v));
   const ns=vals.filter(v=>v!==''&&v!=null).map(numeric).filter(Number.isFinite);
   const sum=ns.reduce((x,y)=>x+y,0);
   const str=i=>String(args[i]??''),num=i=>numeric(args[i]);
   const crit=(v,c)=>{
    const match=/^(>=|<=|<>|>|<|=)(.*)$/.exec(String(c??''));
    const op=match?match[1]:'=',target=match?match[2]:c;
    const a=Number(v),b=Number(target),comparable=Number.isFinite(a)&&Number.isFinite(b);
    const x=comparable?a:String(v??'').toLowerCase(),y=comparable?b:String(target??'').toLowerCase();
    return op==='='?x===y:op==='<>'?x!==y:op==='>'?x>y:op==='<'?x<y:op==='>='?x>=y:x<=y;
   };
   switch(name){
    case 'SUM':return sum;
    case 'AVERAGE':case 'AVG':return ns.length?sum/ns.length:ERR.div;
    case 'COUNT':return ns.length;
    case 'COUNTA':return vals.filter(v=>v!==''&&v!=null).length;
    case 'MIN':return ns.length?Math.min(...ns):0;
    case 'MAX':return ns.length?Math.max(...ns):0;
    case 'PRODUCT':return ns.reduce((x,y)=>x*y,1);
    case 'ABS':return Math.abs(num(0));
    case 'SQRT':return Math.sqrt(num(0));
    case 'POWER':return Math.pow(num(0),num(1));
    case 'ROUND':return Number(num(0).toFixed(Math.max(0,Math.min(12,num(1)||0))));
    case 'ROUNDUP':{const f=Math.pow(10,num(1)||0);return Math.ceil(num(0)*f)/f}
    case 'ROUNDDOWN':{const f=Math.pow(10,num(1)||0);return Math.floor(num(0)*f)/f}
    case 'IF':return args[0]?args[1]:args[2]??'';
    case 'IFERROR':return typeof args[0]==='string'&&args[0][0]==='#'?args[1]??'':args[0];
    case 'AND':return vals.every(Boolean);
    case 'OR':return vals.some(Boolean);
    case 'NOT':return !args[0];
    case 'CONCAT':case 'CONCATENATE':return vals.join('');
    case 'LEN':return str(0).length;
    case 'LOWER':return str(0).toLowerCase();
    case 'UPPER':return str(0).toUpperCase();
    case 'TRIM':return str(0).trim().replace(/\s+/g,' ');
    case 'LEFT':return str(0).slice(0,Math.max(0,num(1)||1));
    case 'RIGHT':return str(0).slice(-Math.max(0,num(1)||1));
    case 'MID':return str(0).slice(Math.max(0,num(1)-1),Math.max(0,num(1)-1)+Math.max(0,num(2)));
    case 'COUNTIF':return (args[0]?.values||[args[0]]).filter(v=>crit(v,args[1])).length;
    case 'SUMIF':{
     const test=args[0]?.values||[args[0]],values=args[2]?.values||test;
     return test.reduce((acc,v,i)=>acc+(crit(v,args[1])?(numeric(values[i])||0):0),0);
    }
    case 'VLOOKUP':{
     const range=args[1]?.matrix;if(!range||!range.length)return ERR.ref;
     const col=Math.floor(num(2));if(!col||col<1||col>range[0].length)return ERR.ref;
     const key=String(args[0]).toLowerCase(),match=range.find(row=>String(row[0]).toLowerCase()===key);
     return match?match[col-1]:'#N/A';
    }
    case 'TODAY':return new Date().toISOString().slice(0,10);
    default:return ERR.name;
   }
  }
 }
 global.NexaFormula={FormulaEngine,colIndex,colName,address,coordinates,supported:['SUM','AVERAGE','COUNT','COUNTA','MIN','MAX','IF','IFERROR','COUNTIF','SUMIF','VLOOKUP','ROUND','ABS','SQRT','CONCAT','CONCATENATE','LEFT','RIGHT','MID','AND','OR','NOT','TODAY','PRODUCT','POWER','UPPER','LOWER','TRIM']};
})(typeof window!=='undefined'?window:globalThis);
