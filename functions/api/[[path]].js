const json=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json',...headers}});
const bad=(m,s=400)=>json({error:m},s);
function cookie(name,value,maxAge){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
function randomHex(n=32){const b=new Uint8Array(n);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
function b64(b){let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s)}
function unb64(s){const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a}
async function hashPassword(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);return b64(bits)}
function sessionToken(req){const m=(req.headers.get('Cookie')||'').match(/(?:^|; )apna_session=([^;]+)/);return m?m[1]:null}
async function userFrom(req,env){const t=sessionToken(req);if(!t)return null;return await env.DB.prepare('SELECT u.id,u.name,u.email,u.phone,COUNT(f.ad_id) AS favorite_count FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN favorites f ON f.user_id=u.id WHERE s.token=? AND s.expires_at>? GROUP BY u.id').bind(t,Date.now()).first()}
function safeName(s){return String(s||'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,80)}

export async function onRequest(context){
 const {request,env}=context; const url=new URL(request.url); const path=url.pathname.replace(/^\/api\/?/,'').replace(/\/$/,'');
 try{
  if(!env.DB) return bad('D1 database binding "DB" is missing.',503);
  if(path==='me' && request.method==='GET') return json({user:await userFrom(request,env)});
  if(path==='auth' && request.method==='POST'){
   const body=await request.json(); const action=body.action;
   if(action==='logout') return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':cookie('apna_session','',0)}});
   const email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
   if(!/^\S+@\S+\.\S+$/.test(email)||password.length<6)return bad('Valid email और कम से कम 6 character password चाहिए।');
   if(action==='signup'){
    const name=String(body.name||'').trim(), phone=String(body.phone||'').trim(); if(!name)return bad('Name required.');
    const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(exists)return bad('यह email पहले से registered है।',409);
    const salt=new Uint8Array(16);crypto.getRandomValues(salt);const hash=await hashPassword(password,salt);
    const r=await env.DB.prepare('INSERT INTO users(name,email,phone,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)').bind(name,email,phone,hash,b64(salt),Date.now()).run();
    const id=r.meta.last_row_id, token=randomHex(32); await env.DB.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').bind(token,id,Date.now()+30*86400000).run();
    return json({user:{id,name,email,phone,favorite_count:0}},{headers:{'Set-Cookie':cookie('apna_session',token,30*86400)}});
   }
   if(action==='login'){
    const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first(); if(!u)return bad('Email या password गलत है।',401);
    const ok=await hashPassword(password,unb64(u.password_salt)); if(ok!==u.password_hash)return bad('Email या password गलत है।',401);
    const token=randomHex(32);await env.DB.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').bind(token,u.id,Date.now()+30*86400000).run();
    const fav=await env.DB.prepare('SELECT COUNT(*) c FROM favorites WHERE user_id=?').bind(u.id).first();
    return json({user:{id:u.id,name:u.name,email:u.email,phone:u.phone,favorite_count:fav?.c||0}},{headers:{'Set-Cookie':cookie('apna_session',token,30*86400)}});
   }
   return bad('Unknown auth action');
  }
  if(path==='ads' && request.method==='GET'){
   const u=await userFrom(request,env), q=url.searchParams.get('q')||'', cat=url.searchParams.get('cat')||'';
   let sql=`SELECT a.*,u.name seller_name,CASE WHEN f.user_id IS NULL THEN 0 ELSE 1 END is_favorite FROM ads a JOIN users u ON u.id=a.user_id LEFT JOIN favorites f ON f.ad_id=a.id AND f.user_id=? WHERE a.status='active'`;
   const binds=[u?.id||0]; if(q){sql+=' AND (a.title LIKE ? OR a.description LIKE ? OR a.location LIKE ?)';const z='%'+q+'%';binds.push(z,z,z)} if(cat){sql+=' AND a.category=?';binds.push(cat)} sql+=' ORDER BY a.created_at DESC LIMIT 100';
   const r=await env.DB.prepare(sql).bind(...binds).all(); return json({ads:r.results.map(a=>({...a,name:a.title,cat:a.category,loc:a.location,desc:a.description,price:a.price,emoji:a.emoji,image_url:a.image_key?'/api/images/'+encodeURIComponent(a.image_key):null}))});
  }
  if(path==='ads' && request.method==='POST'){
   const u=await userFrom(request,env); if(!u)return bad('Login required.',401);
   const fd=await request.formData(); const title=String(fd.get('title')||'').trim(), price=Number(fd.get('price')||0), cat=String(fd.get('cat')||'Other'), loc=String(fd.get('loc')||'').trim(), desc=String(fd.get('desc')||'').trim(), file=fd.get('photo');
   if(!title||!loc||!price||price<0)return bad('Title, price और location required.'); if(title.length>120||loc.length>120||desc.length>3000)return bad('Text too long.');
   let imageKey='';
   if(file && typeof file.arrayBuffer==='function' && file.size){if(file.size>5*1024*1024)return bad('Image max 5MB.'); if(!String(file.type||'').startsWith('image/'))return bad('Only image files allowed.'); if(!env.IMAGES)return bad('R2 binding "IMAGES" is missing.',503); imageKey=`ads/${u.id}/${Date.now()}-${randomHex(8)}-${safeName(file.name||'image')}`;await env.IMAGES.put(imageKey,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}})}
   const r=await env.DB.prepare('INSERT INTO ads(user_id,title,price,category,location,description,image_key,emoji,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(u.id,title,price,cat,loc,desc,imageKey,({Mobiles:'📱',Vehicles:'🚗',Electronics:'💻',Property:'🏠',Furniture:'🛋️',Jobs:'💼',Fashion:'👕',Other:'📦'})[cat]||'📦','active',Date.now()).run();
   return json({ok:true,id:r.meta.last_row_id});
  }
  const adMatch=path.match(/^ads\/(\d+)$/); if(adMatch){const id=Number(adMatch[1]),u=await userFrom(request,env);if(!u)return bad('Login required.',401);const ad=await env.DB.prepare('SELECT * FROM ads WHERE id=?').bind(id).first();if(!ad)return bad('Ad not found',404);if(Number(ad.user_id)!==Number(u.id))return bad('Not allowed',403);if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM ads WHERE id=?').bind(id).run();if(ad.image_key&&env.IMAGES)await env.IMAGES.delete(ad.image_key);return json({ok:true})}}
  const contact=path.match(/^ads\/(\d+)\/contact$/); if(contact&&request.method==='GET'){const ad=await env.DB.prepare('SELECT u.phone,u.email FROM ads a JOIN users u ON u.id=a.user_id WHERE a.id=?').bind(Number(contact[1])).first();if(!ad)return bad('Ad not found',404);return json({phone:ad.phone,email:ad.email})}
  if(path==='favorites'&&request.method==='POST'){const u=await userFrom(request,env);if(!u)return bad('Login required.',401);const b=await request.json(),id=Number(b.ad_id);const e=await env.DB.prepare('SELECT 1 FROM favorites WHERE user_id=? AND ad_id=?').bind(u.id,id).first();if(e)await env.DB.prepare('DELETE FROM favorites WHERE user_id=? AND ad_id=?').bind(u.id,id).run();else await env.DB.prepare('INSERT OR IGNORE INTO favorites(user_id,ad_id) VALUES(?,?)').bind(u.id,id).run();return json({ok:true})}
  const img=path.match(/^images\/(.+)$/); if(img&&request.method==='GET'){if(!env.IMAGES)return new Response('R2 binding missing',{status:503});const key=decodeURIComponent(img[1]);const o=await env.IMAGES.get(key);if(!o)return new Response('Not found',{status:404});return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public, max-age=86400'}})}
  return bad('Not found',404);
 }catch(e){return bad(e?.message||'Server error',500)}
}
