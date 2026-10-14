import {parseSQL} from './sql-engine.js';
self.onmessage=({data:{id,sql}})=>{try{const start=performance.now();const model=parseSQL(sql);self.postMessage({id,model,elapsed:Math.round(performance.now()-start)});}catch(error){self.postMessage({id,error:error.message,offset:error.offset??0});}};
