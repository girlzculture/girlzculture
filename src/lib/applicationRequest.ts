import {ApplicationProgressError} from '@/lib/applicationProgress';
/** Bound the stream itself, not just Content-Length, before parsing a draft. */
export async function readApplicationRequest(request:Request,maximumBytes=65536):Promise<unknown>{
 const invalid=()=>new ApplicationProgressError('INVALID_INPUT','Your application request could not be read. Your edits remain here.');
 const tooLarge=()=>new ApplicationProgressError('INPUT_TOO_LONG','Your application is too long. Shorten the text and try again.');
 if(Number(request.headers.get('content-length'))>maximumBytes)throw tooLarge();
 const reader=request.body?.getReader();if(!reader)throw invalid();
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximumBytes){await reader.cancel();throw tooLarge();}chunks.push(value);}}finally{reader.releaseLock();}
 const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw invalid();}
}
