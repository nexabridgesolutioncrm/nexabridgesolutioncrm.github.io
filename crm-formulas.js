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
  constructor(cells,externalSheets){this.externalSheets=externalSheets||new Map();this.cells=cells&&typeof cells.get==='function'&&typeof cells.has==='function'?cells:new Map(Object.entries(cells||{}));this.cache=new Map();this.depth=0}
  evaluateCell(addr,stack=new Set()){
   const key=String(addr).toUpperCase().replaceAll('$','');
   if(this.cache.has(key))return this.cache.get(key);
   if(stack.has(key))return ERR.cycle;
   if(stack.size>=60)return ERR.cycle;
   const entry=this.cells.get(key),raw=typeof entry==='object'&&entry!==null?entry.raw_value:entry;
   if(raw==null||raw==='')return '';
   if(typeof raw!=='string')return raw;
   if(raw[0]!=='='){const text=raw.trim();return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+\-]?\d+)?$/.test(text)?Number(text):raw;}
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
     const calculate=(x,y)=>{
      if(typeof x==='string'&&x[0]==='#')throw Error(x);
      if(typeof y==='string'&&y[0]==='#')throw Error(y);
      if(op==='&')return String(x??'')+String(y??'');
      if(['=','<>','!=','>','<','>=','<='].includes(op)){
       const a=Number(x),b=Number(y),both=Number.isFinite(a)&&Number.isFinite(b);
       const l=both?a:String(x).toLowerCase(),r=both?b:String(y).toLowerCase();
       return op==='='?l===r:op==='!='||op==='<>'?l!==r:op==='>'?l>r:op==='<'?l<r:op==='>='?l>=r:l<=r;
      }
      const a=numeric(x),b=numeric(y);
      if(!Number.isFinite(a)||!Number.isFinite(b))throw Error(ERR.value);
      return op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:op==='/'?(b===0?ERR.div:a/b):Math.pow(a,b);
     };
     const L=left?.matrix,R=right?.matrix;
     if(L||R){
      const rows=Math.max(L?.length||1,R?.length||1);
      const cols=Math.max(L?.[0]?.length||1,R?.[0]?.length||1);
      if(rows*cols>3000)throw Error(ERR.value);
      if(L?.length>1&&R?.length>1&&L.length!==R.length)throw Error(ERR.value);
      if(L?.[0]?.length>1&&R?.[0]?.length>1&&L[0].length!==R[0].length)throw Error(ERR.value);
      const matrix=[];
      for(let r=0;r<rows;r++){
       const line=[];
       for(let c=0;c<cols;c++)line.push(calculate(L?L[r%L.length][c%L[0].length]:left,R?R[r%R.length][c%R[0].length]:right));
       matrix.push(line);
      }
      left={matrix,values:matrix.flat()};
     }else left=calculate(left,right);
    }
    return left;
   }
   const output=expr(0);if(i!==tokens.length)throw Error(ERR.parse);
   return output;
  }
  query(matrix,statement,headerRows=0){
   if(!Array.isArray(matrix)||matrix.length>10000||!matrix.length)return '#N/A';
   const sql=String(statement||'').trim();
   if(!sql||sql.length>1200)return '#QUERY?';
   // Deliberately bounded subset of Google Visualization Query Language.
   // Queries are parsed as data; SQL/JavaScript code is never executed.
   const parser=/^select\s+(.+?)(?:\s+where\s+(.+?))?(?:\s+group\s+by\s+(.+?))?(?:\s+order\s+by\s+(.+?))?(?:\s+limit\s+(\d+))?(?:\s+offset\s+(\d+))?\s*$/i;
   const m=parser.exec(sql);if(!m)return '#QUERY?';
   const width=Math.max(0,...matrix.map(row=>row.length));
   const col=token=>{
    const v=String(token||'').trim(),c=/^Col(\d{1,3})$/i.exec(v);
    return c?Number(c[1])-1:/^[A-Z]{1,3}$/i.test(v)?colIndex(v):-1;
   };
   const parseField=raw=>{
    const text=String(raw||'').trim(),agg=/^(sum|avg|average|count|min|max)\(\s*(Col\d+|[A-Z]{1,3}|\*)\s*\)$/i.exec(text);
    if(agg){
     const idx=agg[2]==='*'?-1:col(agg[2]);
     if(idx>=width||idx<(-1))return null;
     return {kind:'aggregate',type:agg[1].toLowerCase(),idx,key:text.toLowerCase().replace(/\s+/g,'')};
    }
    const idx=col(text);
    return idx<0||idx>=width?null:{kind:'column',idx,key:text.toLowerCase()};
   };
   const selected=m[1].trim()==='*'?Array.from({length:width},(_,idx)=>({kind:'column',idx,key:'col'+(idx+1)})):
    m[1].split(',').map(parseField);
   if(!selected.length||selected.some(x=>!x))return ERR.ref;
   const group=m[3]?m[3].split(',').map(v=>col(v.trim())):[];
   if(group.some(idx=>idx<0||idx>=width))return ERR.ref;
   const aggregates=selected.some(x=>x.kind==='aggregate');
   if(aggregates&&selected.some(x=>x.kind==='column'&&!group.includes(x.idx)))return '#QUERY?';
   if(group.length&&!aggregates&&selected.some(x=>!group.includes(x.idx)))return '#QUERY?';
   let rows=matrix.slice(Math.max(0,Math.min(20,Number(headerRows)||0))).map((row,index)=>({row,index}));
   if(m[2]){
    const cond=/^(Col\d+|[A-Z]{1,3})\s*(=|<>|!=|>=|<=|>|<|contains|starts\s+with|ends\s+with)\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?))$/i.exec(m[2].trim());
    if(!cond)return '#QUERY?';
    const idx=col(cond[1]);if(idx<0||idx>=width)return ERR.ref;
    const op=cond[2].toLowerCase().replace(/\s+/g,' '),wanted=cond[3]??cond[4]??cond[5]??'';
    rows=rows.filter(({row})=>{
     const original=row[idx],a=Number(original),b=Number(wanted),isNumeric=
      original!==''&&wanted!==''&&Number.isFinite(a)&&Number.isFinite(b);
     const x=isNumeric?a:String(original??'').toLowerCase(),y=isNumeric?b:String(wanted).toLowerCase();
     return op==='contains'?String(x).includes(String(y)):
      op==='starts with'?String(x).startsWith(String(y)):
      op==='ends with'?String(x).endsWith(String(y)):
      op==='='?x===y:op==='!='||op==='<>'?x!==y:
      op==='>'?x>y:op==='<'?x<y:op==='>='?x>=y:x<=y;
    });
   }
   let results;
   if(group.length||aggregates){
    const groups=new Map();
    for(const item of rows){
     const key=JSON.stringify(group.map(i=>item.row[i]??''));
     if(!groups.has(key))groups.set(key,[]);
     groups.get(key).push(item.row);
    }
    if(aggregates&&!group.length)groups.set('[]',rows.map(x=>x.row));
    results=[...groups.values()].map(records=>{
     const first=records[0]||[];
     return selected.map(field=>{
      if(field.kind==='column')return first[field.idx]??'';
      const numbers=records.map(row=>Number(row[field.idx])).filter(n=>Number.isFinite(n));
      const value=field.type==='count'? (field.idx===-1?records.length:records.filter(row=>row[field.idx]!==''&&row[field.idx]!=null).length):
       field.type==='sum'?numbers.reduce((a,b)=>a+b,0):
       field.type==='avg'||field.type==='average'?(numbers.length?numbers.reduce((a,b)=>a+b,0)/numbers.length:0):
       field.type==='min'?(numbers.length?Math.min(...numbers):0):
       (numbers.length?Math.max(...numbers):0);
      return value;
     });
    });
   }else{
    results=rows.map(item=>selected.map(field=>item.row[field.idx]??''));
   }
   if(m[4]){
    const sort=/^(.+?)(?:\s+(asc|desc))?$/i.exec(m[4].trim());
    if(!sort)return '#QUERY?';
    const field=parseField(sort[1]);if(!field)return ERR.ref;
    const pos=selected.findIndex(x=>x.key===field.key||(x.kind==='column'&&field.kind==='column'&&x.idx===field.idx));
    if(pos<0)return '#QUERY?';
    const direction=sort[2]?.toLowerCase()==='desc'?-1:1;
    results.sort((a,b)=>{
     const ax=a[pos],bx=b[pos],an=Number(ax),bn=Number(bx);
     return direction*(ax!==''&&bx!==''&&Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(ax).localeCompare(String(bx)));
    });
   }
   if(m[6])results=results.slice(Math.min(10000,Number(m[6])));
   if(m[5])results=results.slice(0,Math.min(10000,Number(m[5])));
   return {matrix:results.length?results:[['']],values:results.flat()};
  }
  computeSpills(){
   if(this._spills)return this._spills;
   this._spills=new Map();
   const occupied=new Set([...this.cells].filter(([_,entry])=>{
    const raw=typeof entry==='object'&&entry?entry.raw_value:entry;
    return raw!=null&&String(raw)!=='';
   }).map(([key])=>key));
   for(const [start,entry] of this.cells){
    const raw=typeof entry==='object'&&entry?entry.raw_value:entry;
    if(typeof raw!=='string'||raw[0]!=='=')continue;
    const value=this.evaluateCell(start);
    if(!value?.matrix)continue;
    const point=coordinates(start),matrix=value.matrix;
    if(!point||!matrix.length||!matrix[0].length||matrix.length*matrix[0].length>3000)continue;
    let blocked=false;
    for(let r=0;r<matrix.length;r++)for(let c=0;c<matrix[r].length;c++){
     const row=point.row+r,col=point.col+c;
     if(row>=10000||col>=26||((r||c)&&occupied.has(address(row,col))))blocked=true;
    }
    if(blocked){this.cache.set(start,ERR.ref);continue}
    for(let r=0;r<matrix.length;r++)for(let c=0;c<matrix[r].length;c++){
     const loc=address(point.row+r,point.col+c);
     if((r||c)&&this._spills.has(loc)){blocked=true;break}
     this._spills.set(loc,matrix[r][c]);
    }
    if(blocked)this.cache.set(start,ERR.ref);
   }
   return this._spills;
  }
  displayCell(addr){
   const value=this.computeSpills().get(addr);
   if(value!==undefined)return value;
   const result=this.evaluateCell(addr);
   return result?.matrix?result.matrix[0]?.[0]??'':result;
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
    case 'ARRAYFORMULA':return args[0]?.matrix?args[0]:{matrix:[[args[0]??'']],values:[args[0]??'']};
    case 'QUERY':return this.query(args[0]?.matrix||[[args[0]]],args[1],args[2]);
    case 'IMPORTRANGE':{
     const id=String(args[0]||'').trim(),ref=String(args[1]||'').replace(/^.*!/,'').trim();
     if(!/^[a-f0-9-]{36}$/i.test(id))return ERR.ref;
     const external=this.externalSheets.get?.(id);
     if(!external)return '#LINK!';
     const parts=ref.split(':');
     if(parts.length>2)return ERR.ref;
     const a=coordinates(parts[0]),b=coordinates(parts[1]||parts[0]);
     if(!a||!b)return ERR.ref;
     const top=Math.min(a.row,b.row),bottom=Math.max(a.row,b.row),left=Math.min(a.col,b.col),right=Math.max(a.col,b.col);
     if((bottom-top+1)*(right-left+1)>3000)return ERR.value;
     const calc=new FormulaEngine(external,new Map()),matrix=[];
     for(let row=top;row<=bottom;row++){
      const line=[];for(let col=left;col<=right;col++)line.push(calc.evaluateCell(address(row,col)));
      matrix.push(line);
     }
     return {matrix,values:matrix.flat()};
    }

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
    case 'COUNTIFS':{
     if(args.length%2!==0)return ERR.value;
     const ranges=[];for(let j=0;j<args.length;j+=2)ranges.push({values:args[j]?.values||[args[j]],condition:args[j+1]});
     const size=ranges[0]?.values.length||0;
     if(ranges.some(x=>x.values.length!==size))return ERR.value;
     let count=0;for(let i=0;i<size;i++)if(ranges.every(x=>crit(x.values[i],x.condition)))count++;
     return count;
    }
    case 'SUMIFS':{
     const values=args[0]?.values||[args[0]],ranges=[];
     if((args.length-1)%2!==0)return ERR.value;
     for(let j=1;j<args.length;j+=2)ranges.push({values:args[j]?.values||[args[j]],condition:args[j+1]});
     if(ranges.some(x=>x.values.length!==values.length))return ERR.value;
     return values.reduce((total,v,i)=>total+(ranges.every(x=>crit(x.values[i],x.condition))?(numeric(v)||0):0),0);
    }
    case 'INDEX':{
     const rows=args[0]?.matrix||[[args[0]]],row=Math.floor(num(1)),col=Math.floor(num(2)||1);
     return rows[row-1]?.[col-1]??ERR.ref;
    }
    case 'MATCH':{
     const values=args[1]?.values||[args[1]];
     const target=String(args[0]).toLowerCase();
     const found=values.findIndex(v=>String(v).toLowerCase()===target);
     return found<0?'#N/A':found+1;
    }
    case 'XLOOKUP':{
     const look=args[1]?.values||[args[1]],ret=args[2]?.values||[args[2]];
     const match=look.findIndex(v=>String(v).toLowerCase()===String(args[0]).toLowerCase());
     return match<0?(args[3]??'#N/A'):(ret[match]??'#N/A');
    }
    case 'TEXTJOIN':{
     const delimiter=str(0),ignore=Boolean(args[1]);
     return flatten(args.slice(2).map(v=>v&&v.matrix?v.values:v)).filter(v=>!ignore||v!=='').join(delimiter);
    }
    case 'SUBSTITUTE':{
     const original=str(0),search=str(1),replacement=str(2);if(!search)return original;
     if(args.length>3){const nth=Math.floor(num(3));if(nth<=0)return original;let i=0,count=0;
      return original.replaceAll(search,match=>++count===nth?replacement:match)}
     return original.split(search).join(replacement);
    }
    case 'ISBLANK':return args[0]===''||args[0]==null;
    case 'ISNUMBER':return typeof args[0]==='number'&&Number.isFinite(args[0]);
    case 'ISTEXT':return typeof args[0]==='string';
    case 'VALUE':{const n=Number(str(0));return Number.isFinite(n)?n:ERR.value}
    case 'INT':return Math.floor(num(0));
    case 'MOD':return num(1)===0?ERR.div:((num(0)%num(1))+num(1))%num(1);
    case 'CEILING':{const step=num(1)||1;return Math.ceil(num(0)/step)*step}
    case 'FLOOR':{const step=num(1)||1;return Math.floor(num(0)/step)*step}
    case 'DATE':{
     const d=new Date(Date.UTC(num(0),num(1)-1,num(2)));
     return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):ERR.value;
    }
    case 'YEAR':{const d=new Date(str(0));return Number.isFinite(d.getTime())?d.getUTCFullYear():ERR.value}
    case 'MONTH':{const d=new Date(str(0));return Number.isFinite(d.getTime())?d.getUTCMonth()+1:ERR.value}
    case 'DAY':{const d=new Date(str(0));return Number.isFinite(d.getTime())?d.getUTCDate():ERR.value}
    case 'NOW':return new Date().toISOString();
    case 'IFNA':return args[0]==='#N/A'?(args[1]??''):args[0];
    case 'VLOOKUP':{
     const range=args[1]?.matrix;if(!range||!range.length)return ERR.ref;
     const col=Math.floor(num(2));if(!col||col<1||col>range[0].length)return ERR.ref;
     const key=String(args[0]).toLowerCase(),match=range.find(row=>String(row[0]).toLowerCase()===key);
     return match?match[col-1]:'#N/A';
    }
    case 'TODAY':return new Date().toISOString().slice(0,10);
    default:{
     // Optional MIT Formula.js library provides hundreds of Excel-compatible functions.
     // Function names are explicitly restricted; formulas never run arbitrary JavaScript.
     const standard=global.formulajs?.[name];
     if(/^[A-Z][A-Z0-9_.]{1,40}$/.test(name)&&typeof standard==='function'){
      try{
       const values=args.map(x=>x?.matrix?x.matrix:x);
       const result=standard(...values);
       if(result instanceof Error)return '#VALUE!';
       return result;
      }catch(_){return ERR.value}
     }
     return ERR.name;
    }
   }
  }
 }
 global.NexaFormula={FormulaEngine,colIndex,colName,address,coordinates,supported:['SUM','AVERAGE','COUNT','COUNTA','MIN','MAX','IF','IFERROR','COUNTIF','SUMIF','VLOOKUP','ROUND','ABS','SQRT','CONCAT','CONCATENATE','LEFT','RIGHT','MID','AND','OR','NOT','TODAY','PRODUCT','POWER','UPPER','LOWER','TRIM','COUNTIFS','SUMIFS','INDEX','MATCH','XLOOKUP','TEXTJOIN','SUBSTITUTE','ISBLANK','ISNUMBER','ISTEXT','VALUE','INT','MOD','CEILING','FLOOR','DATE','YEAR','MONTH','DAY','NOW','IFNA','ARRAYFORMULA','QUERY','IMPORTRANGE']};
})(typeof window!=='undefined'?window:globalThis);
