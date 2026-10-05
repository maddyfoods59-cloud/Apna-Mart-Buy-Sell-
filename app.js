// Apna Mart full-stack client
let apiAds=[];
let currentUser=null;
let currentProduct=null;
let authMode='login';
const API='/api';

async function api(path, options={}){
  const opts={credentials:'include', ...options};
  opts.headers={...(options.headers||{})};
  if(opts.body && !(opts.body instanceof FormData) && typeof opts.body!=='string'){
    opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(opts.body);
  }
  const r=await fetch(API+path,opts);
  let data={}; try{data=await r.json()}catch{}
  if(!r.ok) throw new Error(data.error||'Request failed');
  return data;
}
function setAuthMode(mode){
  authMode=mode;
  document.getElementById('authTitle').textContent=mode==='login'?'👤 Login to Apna Mart':'📝 Create your Apna Mart account';
  document.getElementById('nameField').style.display=mode==='signup'?'block':'none';
  document.getElementById('authSubmit').textContent=mode==='login'?'Login':'Create account';
  document.getElementById('loginTab').classList.toggle('active',mode==='login');
  document.getElementById('signupTab').classList.toggle('active',mode==='signup');
}
function openLogin(){setAuthMode('login');document.getElementById('loginModal').style.display='flex'}
async function submitAuth(){
  const email=document.getElementById('userEmail').value.trim().toLowerCase();
  const password=document.getElementById('userPassword').value;
  const name=document.getElementById('userName').value.trim();
  const phone=document.getElementById('userPhone').value.trim();
  if(!email||!password||(authMode==='signup'&&!name)){alert('Required details भरें।');return}
  try{
    const data=authMode==='signup'
      ? await api('/auth',{method:'POST',body:{action:'signup',name,email,phone,password}})
      : await api('/auth',{method:'POST',body:{action:'login',email,password}});
    currentUser=data.user; closeModals(); await loadAds(); showPage('profile'); updateProfile(); alert(authMode==='signup'?'✅ Account created!':'✅ Login successful!');
  }catch(e){alert('❌ '+e.message)}
}
async function logout(){try{await api('/auth',{method:'POST',body:{action:'logout'}})}catch{} currentUser=null; await loadAds(); updateProfile(); showPage('home')}
async function loadMe(){try{const x=await api('/me');currentUser=x.user}catch{currentUser=null}}
function updateProfile(){
 document.getElementById('profileName').textContent=currentUser?`${currentUser.name} • ${currentUser.email}`:'Guest User';
 document.getElementById('myCount').textContent=currentUser?apiAds.filter(a=>a.user_id===currentUser.id).length:0;
 document.getElementById('favCount').textContent=Number(currentUser?.favorite_count||0);
 const box=document.querySelector('#profilePage .profile'); if(!box)return;
 let actions=box.querySelector('.actions');
 if(currentUser) actions.innerHTML='<button class="primary" onclick="showMyAds()">My Ads</button><button class="secondary" onclick="logout()">Logout</button>';
 else actions.innerHTML='<button class="primary" onclick="openLogin()">Login / Signup</button><button class="secondary" onclick="openLogin()">Post an Ad</button>';
}
async function loadAds(){
  try{
    const q=document.getElementById('search').value.trim();
    let path='/ads'; const params=[]; if(q)params.push('q='+encodeURIComponent(q)); if(activeFilter)params.push('cat='+encodeURIComponent(activeFilter)); if(params.length)path+='?'+params.join('&');
    const x=await api(path); apiAds=x.ads||[]; render(apiAds);
  }catch(e){document.getElementById('ads').innerHTML='<div class="empty">Server/database connect नहीं हुआ। Cloudflare bindings check करें।</div>'}
}
function searchAds(){activeFilter='';loadAds()}
function filterCat(cat){activeFilter=cat;document.getElementById('search').value='';loadAds()}
function resetFilter(){activeFilter='';document.getElementById('search').value='';loadAds()}
function render(list=apiAds){
 const box=document.getElementById('ads');box.innerHTML='';
 if(!list.length){box.innerHTML='<div class="empty">कोई ad नहीं मिला।</div>';return}
 list.forEach(a=>{
  const c=document.createElement('div');c.className='card';
  const fav=!!a.is_favorite;
  const image=a.image_url?`<img src="${esc(a.image_url)}" loading="lazy">`:(a.emoji||icons[a.cat]||'📦');
  c.innerHTML=`<button class="fav" onclick="toggleFav(${Number(a.id)})">${fav?'♥':'♡'}</button><div class="photo">${image}</div><div class="cardbody"><div class="price">${money(a.price)}</div><div class="name">${esc(a.name)}</div><div class="meta">📍 ${esc(a.loc||'Nearby')} · ${esc(a.seller_name||'Seller')}</div>${currentUser&&Number(a.user_id)===Number(currentUser.id)?`<button onclick="deleteAd(${Number(a.id)})" style="margin-top:9px;border:0;border-radius:6px;padding:7px;background:#eee">Delete</button>`:''}</div>`;
  c.onclick=e=>{if(e.target.closest('button'))return;openProduct(a)}; box.appendChild(c);
 });
 document.getElementById('listingTitle').textContent=activeFilter?activeFilter+' Ads':'Latest Ads'; updateProfile();
}
function openProduct(a){currentProduct=a;document.getElementById('productDetails').innerHTML=`<div class="photo">${a.image_url?`<img src="${esc(a.image_url)}">`:(a.emoji||icons[a.cat]||'📦')}</div><h2>${esc(a.name)}</h2><h2>${money(a.price)}</h2><p><b>Category:</b> ${esc(a.cat)}</p><p>📍 ${esc(a.loc||'Nearby')}</p><p>${esc(a.desc||'Seller ने कोई description नहीं दिया।')}</p><p><b>Seller:</b> ${esc(a.seller_name||'Seller')}</p>`;document.getElementById('productModal').style.display='flex'}
async function contactSeller(){if(!currentProduct)return;try{const x=await api('/ads/'+currentProduct.id+'/contact');alert(`Seller contact:\n${x.phone||'Mobile not provided'}\n${x.email||''}`)}catch(e){alert('Login करके seller contact देखें।')}}
function previewPhoto(){const f=document.getElementById('adPhoto').files[0];if(!f)return;const r=new FileReader();r.onload=()=>document.getElementById('preview').innerHTML=`<img src="${r.result}">`;r.readAsDataURL(f)}
async function postAd(){
 if(!currentUser){closeModals();openLogin();alert('पहले Login/Signup करें।');return}
 const title=document.getElementById('adTitle').value.trim(),price=document.getElementById('adPrice').value,cat=document.getElementById('adCat').value,loc=document.getElementById('adLoc').value.trim(),desc=document.getElementById('adDesc').value.trim(),file=document.getElementById('adPhoto').files[0];
 if(!title||!price||!loc){alert('Title, price और location भरें।');return}
 if(file && file.size>5*1024*1024){alert('Photo 5MB से छोटी रखें।');return}
 const fd=new FormData();fd.append('title',title);fd.append('price',price);fd.append('cat',cat);fd.append('loc',loc);fd.append('desc',desc);if(file)fd.append('photo',file);
 try{await api('/ads',{method:'POST',body:fd});closeModals();clearForm();await loadAds();alert('✅ आपका ad online publish हो गया!')}catch(e){alert('❌ '+e.message)}
}
function clearForm(){['adTitle','adPrice','adLoc','adDesc'].forEach(id=>document.getElementById(id).value='');document.getElementById('adPhoto').value='';document.getElementById('preview').textContent='📷 Photo preview'}
async function deleteAd(id){if(!confirm('यह ad delete करें?'))return;try{await api('/ads/'+id,{method:'DELETE'});await loadAds();alert('Ad deleted.')}catch(e){alert('❌ '+e.message)}}
async function toggleFav(id){if(!currentUser){openLogin();return}try{await api('/favorites',{method:'POST',body:{ad_id:id}});await loadAds()}catch(e){alert('❌ '+e.message)}}
async function showMyAds(){if(!currentUser){openLogin();return}activeFilter='';document.getElementById('search').value='';const mine=apiAds.filter(a=>Number(a.user_id)===Number(currentUser.id));showPage('home');render(mine);document.getElementById('listingTitle').textContent='My Ads'}
function showPage(p){document.getElementById('homePage').classList.toggle('hidden',p!=='home');document.getElementById('profilePage').classList.toggle('hidden',p!=='profile');if(p==='profile')updateProfile()}
function setLocation(){const x=prompt('अपना City / Area लिखें:');if(x)document.getElementById('location').textContent=x}
window.addEventListener('load',async()=>{await loadMe();updateProfile();await loadAds()});
