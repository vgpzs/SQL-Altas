// Lossless, offset-based SQL inspection. SQL is never executed.
export const MAX_BYTES = 5 * 1024 * 1024;
const upper=t=>t?.value.toUpperCase();
const is=(t,v)=>t?.kind==='word'&&upper(t)===v;
const key=s=>s.toLowerCase();
function fail(message,offset=0){const e=new Error(message);e.offset=offset;throw e;}
export function tokenize(sql){
  const tokens=[];let i=0;
  while(i<sql.length){
    const start=i,c=sql[i];
    if(/\s/.test(c)){i++;continue;}
    if(c==='-'&&sql[i+1]==='-'){while(i<sql.length&&sql[i]!=='\n')i++;continue;}
    if(c==='/'&&sql[i+1]==='*'){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.slice(i,i+2)==='/*'){depth++;i+=2;}else if(sql.slice(i,i+2)==='*/'){depth--;i+=2;}else i++;}if(depth)fail('Comentário /* sem fechamento.',start);continue;}
    const dollar=c==='$'?sql.slice(i).match(/^\$(?:[A-Za-z_]\w*)?\$/):null;
    if(dollar){const tag=dollar[0],end=sql.indexOf(tag,i+tag.length);if(end<0)fail('Texto delimitado por dólar sem fechamento.',start);i=end+tag.length;tokens.push({kind:'string',value:sql.slice(start,i),start,end:i});continue;}
    if(c==="'"||c==='"'||c==='`'||c==='['){const endChar=c==='['?']':c;let closed=false;i++;while(i<sql.length){if(sql[i]===endChar){if(sql[i+1]===endChar){i+=2;continue;}i++;closed=true;break;}if(sql[i]==='\\'&&c==="'"){i+=2;continue;}i++;}if(!closed)fail('Aspas ou identificador sem fechamento.',start);const raw=sql.slice(start,i);tokens.push({kind:c==="'"?'string':'identifier',value:c==="'"?raw:raw.slice(1,-1).split(endChar+endChar).join(endChar),start,end:i});continue;}
    if(/[A-Za-z_\u0080-\uffff]/.test(c)){i++;while(i<sql.length&&/[\w$\u0080-\uffff]/.test(sql[i]))i++;tokens.push({kind:'word',value:sql.slice(start,i),start,end:i});continue;}
    if(/[0-9]/.test(c)){i++;while(i<sql.length&&/[\w.]/.test(sql[i]))i++;tokens.push({kind:'number',value:sql.slice(start,i),start,end:i});continue;}
    tokens.push({kind:'symbol',value:c,start,end:++i});
  }
  return tokens;
}
function identifier(ts,index){const first=ts[index];if(!first||!['word','identifier'].includes(first.kind))fail('Esperado um nome de tabela ou coluna.',first?.start);let i=index+1,name=first.value;const parts=[first];while(ts[i]?.value==='.'&&['word','identifier'].includes(ts[i+1]?.kind)){parts.push(ts[i+1]);name+='.'+ts[i+1].value;i+=2;}return {name,key:key(name),start:first.start,end:ts[i-1].end,next:i,parts};}
// Keep depth accounting explicit: punctuation inside quoted tokens is not punctuation.
function closeParen(ts,index){let d=0;for(let i=index;i<ts.length;i++){if(ts[i].kind!=='symbol')continue;if(ts[i].value==='(')d++;if(ts[i].value===')'){d--;if(d===0)return i;}}fail('Parêntese sem fechamento.',ts[index]?.start);}
function split(ts){const groups=[];let from=0,d=0;for(let i=0;i<ts.length;i++){if(ts[i].kind!=='symbol')continue;if(ts[i].value==='(')d++;else if(ts[i].value===')')d--;else if(ts[i].value===','&&d===0){groups.push(ts.slice(from,i));from=i+1;}}if(from<ts.length)groups.push(ts.slice(from));else if(ts.length)fail('Vírgula sem definição seguinte.',ts.at(-1).start);return groups;}
function findTop(ts,predicate){let d=0;for(let i=0;i<ts.length;i++){if(d===0&&predicate(ts[i],i))return i;if(ts[i].kind==='symbol'&&ts[i].value==='(')d++;if(ts[i].kind==='symbol'&&ts[i].value===')')d--;}return -1;}
function namesIn(ts,index){if(ts[index]?.value!=='(')fail('Esperada uma lista de colunas.',ts[index]?.start);const end=closeParen(ts,index);return {names:split(ts.slice(index+1,end)).map(g=>identifier(g,0).name),end};}
const attrs=new Set(['CONSTRAINT','PRIMARY','NOT','NULL','UNIQUE','REFERENCES','DEFAULT','CHECK','COLLATE','GENERATED','AUTO_INCREMENT','AUTOINCREMENT','COMMENT','IDENTITY']);
function definition(ts,sql,table){
  if(!ts.length)fail('Definição de coluna vazia.',table.bodyStart);
  let k=0;if(is(ts[0],'CONSTRAINT')){identifier(ts,1);k=2;}
  if(is(ts[k],'PRIMARY')||is(ts[k],'FOREIGN')||is(ts[k],'UNIQUE')||is(ts[k],'CHECK')||is(ts[k],'KEY')||is(ts[k],'INDEX')||is(ts[k],'EXCLUDE')){
    const constraint={kind:upper(ts[k]),start:ts[0].start,end:ts.at(-1).end,names:[]};
    if(is(ts[k],'PRIMARY')||is(ts[k],'UNIQUE')){const p=ts.findIndex((t,i)=>i>k&&t.value==='(');if(p<0)fail('Restrição sem colunas.',ts[k].start);constraint.names=namesIn(ts,p).names;}
    if(is(ts[k],'FOREIGN')){if(!is(ts[k+1],'KEY'))fail('Esperado FOREIGN KEY.',ts[k].start);const own=namesIn(ts,k+2),r=own.end+1;if(!is(ts[r],'REFERENCES'))fail('Chave estrangeira sem REFERENCES.',ts[k].start);const target=identifier(ts,r+1),ref=namesIn(ts,target.next);if(own.names.length!==ref.names.length)fail('A chave estrangeira e a referência precisam do mesmo número de colunas.',ts[k].start);table.relations.push({columns:own.names,target:target.name,targetKey:target.key,targetColumns:ref.names,start:ts[0].start,end:ts.at(-1).end});constraint.names=own.names;}
    table.constraints.push(constraint);return;
  }
  const id=identifier(ts,0);if(id.parts.length!==1)fail('Nome de coluna inválido.',id.start);
  const attr=findTop(ts.slice(id.next),t=>t.kind==='word'&&attrs.has(upper(t)));
  const typeEnd=attr<0?ts.length:id.next+attr;
  if(typeEnd===id.next)fail(`A coluna ${id.name} precisa de um tipo.`,id.start);
  const primaryIndex=findTop(ts,(t,i)=>is(t,'PRIMARY')&&is(ts[i+1],'KEY'));
  const notIndex=findTop(ts,(t,i)=>is(t,'NOT')&&is(ts[i+1],'NULL'));
  const nullIndex=findTop(ts,(t,i)=>is(t,'NULL')&&!is(ts[i-1],'NOT')&&!is(ts[i-1],'DEFAULT'));
  const col={name:id.name,key:key(id.name),nameStart:id.start,nameEnd:id.end,type:sql.slice(ts[id.next].start,ts[typeEnd-1].end),typeStart:ts[id.next].start,typeEnd:ts[typeEnd-1].end,start:ts[0].start,end:ts.at(-1).end,primary:primaryIndex>=0,inlinePrimary:primaryIndex>=0,nullable:notIndex<0&&primaryIndex<0,unique:findTop(ts,t=>is(t,'UNIQUE'))>=0,notRange:notIndex<0?null:[ts[notIndex].start,ts[notIndex+1].end],nullRange:nullIndex<0?null:[ts[nullIndex].start,ts[nullIndex].end],pkRange:primaryIndex<0?null:[ts[primaryIndex].start,ts[primaryIndex+1].end]};
  if(table.columns.some(c=>c.key===col.key))fail(`Coluna duplicada: ${id.name}.`,id.start);
  table.columns.push(col);
  const r=findTop(ts,t=>is(t,'REFERENCES'));if(r>=0){const target=identifier(ts,r+1),ref=namesIn(ts,target.next);if(ref.names.length!==1)fail('Referência de coluna precisa de uma coluna de destino.',ts[r].start);table.relations.push({columns:[id.name],target:target.name,targetKey:target.key,targetColumns:ref.names,start:ts[r].start,end:ts.at(-1).end,inline:true});}
}
export function parseSQL(sql){
  if(sql.length>MAX_BYTES)fail('O limite desta versão é 5 MB por arquivo.');
  const tokens=tokenize(sql),statements=[];let from=0,d=0;
  for(let i=0;i<tokens.length;i++){const t=tokens[i];if(t.kind==='symbol'){if(t.value==='(')d++;if(t.value===')'){d--;if(d<0)fail('Parêntese de fechamento inesperado.',t.start);}if(t.value===';'&&d===0){if(i>from)statements.push(tokens.slice(from,i));from=i+1;}}}
  if(d!==0)fail('Parêntese sem fechamento.',tokens.at(-1)?.end);if(from<tokens.length)statements.push(tokens.slice(from));
  const tables=[],warnings=[],ignored=[];let rowCount=0;
  for(const ts of statements){
    let i=1;if(is(ts[0],'CREATE')){if(is(ts[i],'TEMP')||is(ts[i],'TEMPORARY')||is(ts[i],'UNLOGGED'))i++;if(!is(ts[i],'TABLE')){ignored.push(ts);continue;}i++;if(is(ts[i],'IF')&&is(ts[i+1],'NOT')&&is(ts[i+2],'EXISTS'))i+=3;
      const id=identifier(ts,i);if(ts[id.next]?.value!=='(')fail(`CREATE TABLE ${id.name}: somente definições com colunas entre parênteses são visualizadas.`,id.start);const end=closeParen(ts,id.next);
      if(tables.some(t=>t.key===id.key))fail(`Tabela duplicada: ${id.name}.`,id.start);
      const table={name:id.name,key:id.key,start:ts[0].start,end:ts.at(-1).end,nameStart:id.start,nameEnd:id.end,bodyStart:ts[id.next].end,bodyEnd:ts[end].start,columns:[],constraints:[],relations:[],rows:[],insertCount:0,definitions:[]};
      const defs=split(ts.slice(id.next+1,end));for(const def of defs){table.definitions.push({start:def[0].start,end:def.at(-1).end});definition(def,sql,table);}if(!table.columns.length)fail(`A tabela ${id.name} precisa de pelo menos uma coluna.`,id.start);tables.push(table);
    }
  }
  function lookup(name){return tables.find(t=>t.key===key(name));}
  for(const ts of statements){
    if(is(ts[0],'ALTER')&&is(ts[1],'TABLE')){let p=2;if(is(ts[p],'ONLY'))p++;const id=identifier(ts,p),table=lookup(id.name);let k=id.next;if(is(ts[k],'ADD')){k++;if((is(ts[k],'CONSTRAINT')||is(ts[k],'FOREIGN')||is(ts[k],'PRIMARY')||is(ts[k],'UNIQUE'))&&table){definition(ts.slice(k),sql,table);continue;}}ignored.push(ts);continue;}
    if(!is(ts[0],'INSERT'))continue;
    let i=1;if(is(ts[i],'OR'))i+=2;if(is(ts[i],'IGNORE'))i++;if(!is(ts[i],'INTO')){ignored.push(ts);continue;}const id=identifier(ts,i+1),table=lookup(id.name);if(!table){warnings.push(`INSERT de ${id.name}: tabela não definida no arquivo.`);continue;}
    let p=id.next,cols=table.columns.map(c=>c.name);if(ts[p]?.value==='('){const n=namesIn(ts,p);cols=n.names;p=n.end+1;}
    if(!is(ts[p],'VALUES')){ignored.push(ts);continue;}p++;table.insertCount++;
    const colKeys=cols.map(key);if(new Set(colKeys).size!==cols.length||colKeys.some(c=>!table.columns.some(x=>x.key===c)))fail(`INSERT de ${table.name}: lista de colunas inválida.`,ts[0].start);
    while(p<ts.length){if(ts[p]?.value!=='(')fail(`INSERT de ${table.name}: esperado um grupo de valores.`,ts[p]?.start);const end=closeParen(ts,p),values=split(ts.slice(p+1,end));if(values.length!==cols.length)fail(`INSERT de ${table.name}: ${values.length} valores para ${cols.length} colunas.`,ts[p].start);
      rowCount++;if(table.rows.length<20000){const cells=values.map((v,j)=>{if(!v.length)fail('Valor vazio no INSERT.',ts[p].start);const raw=sql.slice(v[0].start,v.at(-1).end);return {column:cols[j],key:key(cols[j]),raw,value:displayValue(raw),start:v[0].start,end:v.at(-1).end};});table.rows.push({cells});}
      p=end+1;if(ts[p]?.value===','){p++;if(p>=ts.length)fail('Vírgula final no INSERT.',ts[end].end);continue;}if(p<ts.length)warnings.push(`Sufixo do INSERT de ${table.name} preservado; a grade mostra os VALUES antes de conflitos ou RETURNING.`);break;
    }
  }
  for(const t of tables){for(const c of t.constraints){for(const n of c.names){const col=t.columns.find(x=>x.key===key(n));if(!col)fail(`Restrição de ${t.name}: coluna ${n} não existe.`,c.start);if(c.kind==='PRIMARY'){col.primary=true;col.nullable=false;col.tablePrimary=true;}}}for(const r of t.relations){for(const n of r.columns)if(!t.columns.some(c=>c.key===key(n)))fail(`Relação de ${t.name}: coluna ${n} não existe.`,r.start);const target=lookup(r.target);if(!target){warnings.push(`Referência externa: ${t.name} → ${r.target}.`);continue;}for(const n of r.targetColumns)if(!target.columns.some(c=>c.key===key(n)))fail(`Referência de ${t.name}: ${r.target}.${n} não existe.`,r.start);}if(t.rows.length===20000)warnings.push(`${t.name}: a grade limita a prévia a 20.000 registros; o arquivo completo foi preservado.`);}
  const unhandled=statements.filter(ts=>!is(ts[0],'CREATE')&&!is(ts[0],'INSERT')&&!is(ts[0],'ALTER')&&!['BEGIN','COMMIT','PRAGMA','SET','USE'].some(w=>is(ts[0],w)));
  if(ignored.length||unhandled.length)warnings.push(`${ignored.length+unhandled.length} comando(s) preservado(s) somente no código. ALTER de colunas, UPDATE, DELETE, views e consultas não são executados nem refletidos na prévia.`);
  if(/\\./.test(sql)&&tokens.some(t=>t.kind==='string'&&/\\./.test(t.value)))warnings.push('Literais com escapes de barra: a interpretação varia entre bancos. A grade mantém o texto sem interpretar esses escapes.');
  return {tables,warnings:[...new Set(warnings)],rowCount,statementCount:statements.length,relationCount:tables.reduce((s,t)=>s+t.relations.length,0)};
}
export function displayValue(raw){if(/^NULL$/i.test(raw))return null;if(raw.startsWith("'")&&raw.endsWith("'"))return raw.slice(1,-1).replaceAll("''","'");return raw;}
export function patches(sql,edits){const sorted=[...edits].sort((a,b)=>b.start-a.start);let boundary=sql.length;for(const e of sorted){if(e.start<0||e.end<e.start||e.end>boundary)fail('Edições sobrepostas ou inválidas.');sql=sql.slice(0,e.start)+e.text+sql.slice(e.end);boundary=e.start;}return sql;}
export function validateIdentifier(name){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))fail('Use letras, números e _, começando por uma letra ou _.');const reserved=new Set(['SELECT','TABLE','CREATE','INSERT','UPDATE','DELETE','FROM','WHERE','ORDER','GROUP','USER','PRIMARY','FOREIGN','KEY','VALUES','INDEX','NULL','DEFAULT','ALTER','CONSTRAINT','CHECK','REFERENCES','UNIQUE','NOT','INTO','JOIN','AND','OR','AS','BY','LIMIT','SET','WITH']);if(reserved.has(name.toUpperCase()))fail('Use um nome que não seja palavra reservada de SQL.');return name;}
export function validateType(type){type=type.trim();if(!/^[A-Za-z_][A-Za-z0-9_. ]*(?:\(\s*\d+\s*(?:,\s*\d+\s*)?\))?(?:\[\])*$/i.test(type)||type.split(/\W+/).some(t=>attrs.has(t.toUpperCase())&&!['NULL'].includes(t.toUpperCase())))fail('Tipo inválido. Exemplos: INTEGER, VARCHAR(100), DECIMAL(10, 2), TIMESTAMP ou TEXT.');return type;}
export function updateColumn(sql,table,column,{type,nullable,primary}){
  type=validateType(type);const edits=[{start:column.typeStart,end:column.typeEnd,text:type}];
  if(primary!==column.primary){if(column.tablePrimary)fail('Edite a chave primária composta ou de tabela no código SQL.');if(primary&&table.columns.some(c=>c.primary))fail('A tabela já tem uma chave primária. Para compor uma chave, use o editor SQL.');if(primary)edits.push({start:column.end,end:column.end,text:' PRIMARY KEY'});else edits.push({start:column.pkRange[0],end:column.pkRange[1],text:''});}
  if(primary&&nullable)fail('Uma chave primária não pode aceitar NULL.');
  // Compare explicit nullability rather than implicit PK nullability.
  if(!nullable&&!column.notRange&&!primary){if(column.nullRange)edits.push({start:column.nullRange[0],end:column.nullRange[1],text:'NOT NULL'});else edits.push({start:column.end,end:column.end,text:' NOT NULL'});}
  if(nullable&&column.notRange)edits.push({start:column.notRange[0],end:column.notRange[1],text:''});
  if(primary&&column.nullRange)edits.push({start:column.nullRange[0],end:column.nullRange[1],text:''});
  return patches(sql,edits);
}
export function addColumn(sql,table,{name,type,nullable=true,primary=false}){validateIdentifier(name);validateType(type);if(table.columns.some(c=>c.key===key(name)))fail('Já existe uma coluna com esse nome.');if(primary&&table.columns.some(c=>c.primary))fail('A tabela já tem uma chave primária.');if(table.insertCount)fail('Esta tabela tem INSERTs. Acrescente a coluna e ajuste os INSERTs no código SQL para manter os valores consistentes.');return patches(sql,[{start:table.bodyEnd,end:table.bodyEnd,text:`,\n  ${name} ${type}${primary?' PRIMARY KEY':nullable?'':' NOT NULL'}\n`}]);}
export function addTable(sql,name){validateIdentifier(name);const model=parseSQL(sql);if(model.tables.some(t=>t.key===key(name)))fail('Já existe uma tabela com esse nome.');return sql.trimEnd()+`\n\nCREATE TABLE ${name} (\n  id INTEGER PRIMARY KEY\n);\n`;}
export function addRelation(sql,table,column,target,targetColumn){if(!table.columns.some(c=>c.name===column)||!target.columns.some(c=>c.name===targetColumn))fail('Coluna de origem ou destino inválida.');if(table.relations.some(r=>r.columns.includes(column)))fail('Esta coluna já participa de uma relação.');const tc=target.columns.find(c=>c.name===targetColumn);if(!tc.primary&&!tc.unique)fail('A coluna de destino precisa ser PRIMARY KEY ou UNIQUE.');if(target.columns.filter(c=>c.primary).length>1&&tc.primary)fail('Para referências a chaves compostas, use o código SQL.');const source=table.columns.find(c=>c.name===column);const targetName=sql.slice(target.nameStart,target.nameEnd);return patches(sql,[{start:table.bodyEnd,end:table.bodyEnd,text:`,\n  FOREIGN KEY (${sql.slice(source.nameStart,source.nameEnd)}) REFERENCES ${targetName}(${sql.slice(tc.nameStart,tc.nameEnd)})\n`}]);}
export function editCell(sql,cell,raw){raw=raw.trim();if(!/^(?:NULL|TRUE|FALSE|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|'(?:[^'\\]|'')*')$/i.test(raw))fail("Informe um literal SQL: 'texto', 123, TRUE, FALSE ou NULL. Aspas no texto devem ser duplicadas.");return patches(sql,[{start:cell.start,end:cell.end,text:raw}]);}
export function removeColumn(sql,model,table,col){if(table.columns.length===1)fail('A tabela precisa de ao menos uma coluna.');if(table.insertCount)fail('Esta tabela tem INSERTs. Remova a coluna e ajuste os INSERTs no código SQL.');if(col.primary||table.constraints.some(c=>c.names.some(n=>key(n)===col.key))||table.relations.some(r=>r.columns.some(n=>key(n)===col.key))||model.tables.some(t=>t.relations.some(r=>r.targetKey===table.key&&r.targetColumns.some(n=>key(n)===col.key))))fail('Esta coluna participa de uma chave ou relação. Ajuste as dependências no código SQL.');if(table.constraints.some(c=>c.kind==='CHECK')||/\b(?:CHECK|GENERATED)\b/i.test(sql.slice(table.bodyStart,table.bodyEnd)))fail('A tabela contém expressões. Remova a coluna no editor para revisar suas dependências.');const index=table.definitions.findIndex(d=>d.start===col.start),defs=table.definitions;if(index<defs.length-1)return patches(sql,[{start:col.start,end:defs[index+1].start,text:''}]);return patches(sql,[{start:defs[index-1].end,end:col.end,text:''}]);}
