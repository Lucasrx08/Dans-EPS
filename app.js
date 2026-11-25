'use strict';
const $=id=>document.getElementById(id);
const data=[
 {name:'Déplacements / espace',short:'Espace',items:[['Diagonale','Traversez la scène en diagonale.'],['Trajectoire courbe','Essayez une trajectoire courbe plutôt que rectiligne.'],['Changement de direction','Variez les directions du déplacement.'],['Occupation scénique','Utilisez une autre zone de la scène.'],['Niveaux haut / moyen / bas','Intégrez un changement de hauteur.'],['Passage au sol','Construisez un passage au sol contrôlé.']]},
 {name:'Formations',short:'Formations',items:[['Ligne','Alignez-vous sur un même axe.'],['Colonne','Placez-vous les uns derrière les autres.'],['Diagonale','Alignez-vous en diagonale.'],['Cercle','Répartissez-vous autour d’un centre.'],['V','Formez deux lignes convergentes.'],['Quinconce','Alternez les placements sur deux lignes.'],['Groupe compact / dispersé','Variez les distances entre danseurs.'],['Transition de formation','Transformez le déplacement entre deux formations en mouvement dansé.']]},
 {name:'Gestes parasites',short:'Gestes parasites',items:[['Hésitation / arrêt involontaire','Répétez le passage pour rendre le mouvement continu.'],['Regard de vérification','Utilisez des repères corporels ou musicaux plutôt que de chercher le regard des autres.'],['Rire / parole involontaire','Maintenez votre intention jusqu’à la fin.'],['Ajustement de tenue / cheveux','Préparez la tenue avant de commencer.'],['Attente non dansée','Donnez une intention au corps pendant l’attente.']]},
 {name:'Refrain imposé',short:'Refrain',items:[['Apparition du refrain','Rendez la phrase imposée identifiable.'],['Synchronisation du refrain','Répétez la phrase avec des repères communs.'],['Transformation du refrain','Changez son orientation, son énergie ou son niveau.'],['Répétition du refrain','Réintégrez le refrain à un moment choisi.']]},
 {name:'Temps / rythme',short:'Temps',items:[['Lent / rapide','Créez un contraste net de vitesse.'],['Accélération / décélération','Faites évoluer progressivement la vitesse.'],['Immobilité volontaire','Marquez un arrêt expressif.'],['Rupture rythmique','Introduisez une rupture perceptible.'],['Relation à la musique','Choisissez des repères sonores communs.'],['Synchronisation','Travaillez les départs et les fins de mouvements.']]},
 {name:'Procédés de composition',short:'Procédés',items:[['Unisson','Même mouvement réalisé simultanément.'],['Canon','Même mouvement déclenché successivement à des instants différents.'],['Répétition','Reproduisez une phrase gestuelle.'],['Miroir','Réalisez des gestes symétriques.'],['Accumulation','Ajoutez progressivement des mouvements ou des danseurs.'],['Alternance','Alternez les interventions des danseurs.'],['Contraste','Opposez deux qualités de mouvement.'],['Question-réponse','Un mouvement d’un danseur appelle une réponse d’un autre.']]},
 {name:'Corps / énergie',short:'Corps',items:[['Amplitude','Agrandissez la trajectoire des gestes.'],['Dissociation','Mobilisez différentes parties du corps.'],['Contraste d’énergie','Alternez un mouvement fluide et un mouvement explosif.'],['Intention artistique','Rendez l’émotion lisible dans les gestes.']]},
 {name:'Structure / relations',short:'Structure',items:[['Début / fin','Rendez le début et la fin clairement perceptibles.'],['Transition','Reliez deux phrases sans rupture involontaire.'],['Relation entre danseurs','Créez une interaction intentionnelle.']]}
];
const states={ok:{label:'Maîtrisé',color:'#55946c'},improve:{label:'À améliorer',color:'#b17e24'},add:{label:'À intégrer',color:'#538b93'}};
let annotations=[],priorities=new Set(),category=0,criterion=0,mark=0,rangeStart=null,rangeEnd=null,editing=null,videoURL=null,stream=null,rec=null,chunks=[],timer=null,countTimer=null,cameraToken=0,started=0,view='film',waitingWorker=null,recordGeneration=0,knownDuration=0;
const player=$('player'),camera=$('camera');
const say=s=>$('message').textContent=s;
const time=n=>{n=Math.max(0,Math.floor(Number(n)||0));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
const length=()=>Number.isFinite(player.duration)&&player.duration>0?player.duration:knownDuration;
const button=(label,fn,cls='')=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls;b.onclick=fn;return b};
function show(next) {
  if (next !== 'film' && (rec || countTimer)) {
    say('Terminez la captation avant de changer d’étape.');
    return;
  }
  if (next !== 'film' && !videoURL) return;
  if (next !== 'film') releaseCamera();
  view = next;
  say('');
  document.querySelectorAll('nav button').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('film').hidden = view !== 'film';
  $('analysisView').hidden = view !== 'analyze';
  $('transform').hidden = view !== 'transform';
  if (view !== 'analyze') {
    player.pause();
    closeEditor();
  }
  if (view === 'transform') {
    $('priorityError').textContent = '';
    renderSummary();
  }
  expandVideo(false);
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => show(button.dataset.view);
});
$('resume').onclick = () => show('analyze');

function controls() {
  const hasVideo = Boolean(videoURL);
  document.querySelectorAll('nav button[data-view]:not([data-view="film"])').forEach(button => {
    button.disabled = !hasVideo;
  });
  $('resume').hidden = !hasVideo;
  captureControls();
}

function captureControls() {
  const busy = Boolean(countTimer || rec);
  $('enable').hidden = Boolean(stream);
  $('start').hidden = !stream || Boolean(rec);
  $('start').disabled = busy;
  $('start').textContent = countTimer ? 'Compte à rebours…' : 'Enregistrer';
  $('stop').hidden = !rec;
  $('stop').disabled = rec?.state !== 'recording';
  $('closeCamera').hidden = !stream || Boolean(rec);
  $('closeCamera').textContent = countTimer ? 'Annuler le départ' : 'Fermer la caméra';
  $('import').hidden = Boolean(stream);
  $('reset').hidden = !videoURL && !stream;
  $('audio').disabled = Boolean(stream);
  $('countdown').disabled = busy;
  camera.parentElement.classList.toggle('is-active', Boolean(stream));
}

function releaseCamera() {
  cameraToken++;
  $('enable').disabled = false;
  clearInterval(countTimer);
  countTimer = null;
  clearInterval(timer);
  timer = null;
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  camera.srcObject = null;
  $('cameraEmpty').hidden = false;
  $('recordBadge').hidden = true;
  captureControls();
}
function clearVideo(){player.pause();player.removeAttribute('src');player.load();if(videoURL)URL.revokeObjectURL(videoURL);videoURL=null;knownDuration=0;annotations=[];priorities.clear();closeEditor();$('annotationFeedback').textContent='';controls();renderNotes();renderClock()}
function resetSession(){recordGeneration++;if(rec&&rec.state!=='inactive'){try{rec.stop()}catch(_){}}rec=null;chunks=[];releaseCamera();clearVideo();$('file').value='';$('audio').checked=false;$('captureSettings').open=false;captureControls();$('filter').value='';show('film');say('Séance effacée.')}
$('reset').onclick=()=>{if(confirm('Effacer la vidéo et toutes les observations de cette séance ?'))resetSession()};
$('import').onclick = () => $('file').click();

async function enable() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    say('Caméra indisponible. Vous pouvez importer une vidéo autorisée.');
    return;
  }
  const token = ++cameraToken;
  $('enable').disabled = true;
  try {
    const source = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 25, max: 30 }
      },
      audio: $('audio').checked
    });
    if (token !== cameraToken || view !== 'film') {
      source.getTracks().forEach(track => track.stop());
      return;
    }
    stream = source;
    camera.srcObject = source;
    $('cameraEmpty').hidden = true;
    captureControls();
    say('');
  } catch (_) {
    if (token === cameraToken) {
      captureControls();
      say('Caméra inaccessible. Vérifiez les autorisations du navigateur.');
    }
  } finally {
    if (token === cameraToken) $('enable').disabled = false;
  }
}
$('enable').onclick = enable;
$('closeCamera').onclick = () => {
  releaseCamera();
  say('');
};

function loadVideo(blob,estimated=0){clearVideo();knownDuration=estimated;videoURL=URL.createObjectURL(blob);player.src=videoURL;player.load();controls();renderClock();show('analyze')}
$('file').onchange=()=>{const f=$('file').files[0];if(!f)return;if(rec&&rec.state!=='inactive'||countTimer){say('Terminez la captation en cours.');$('file').value='';return}if(f.size>250*1024*1024){say('Vidéo trop volumineuse (250 Mo maximum).');$('file').value='';return}if(videoURL&&!confirm('Remplacer la vidéo et ses annotations ?')){$('file').value='';return}releaseCamera();loadVideo(f);$('file').value=''};
function beginRecording(){if(!stream)return;const g=++recordGeneration;const parts=[];try{const types=['video/mp4','video/webm;codecs=vp8','video/webm'];const type=types.find(t=>MediaRecorder.isTypeSupported?.(t));const options={videoBitsPerSecond:2200000};if(type)options.mimeType=type;const r=new MediaRecorder(stream,options);rec=r;chunks=parts;r.ondataavailable=e=>{if(g===recordGeneration&&e.data.size)parts.push(e.data)};r.onerror=()=>{if(g===recordGeneration){recordGeneration++;rec=null;chunks=[];releaseCamera();say('Erreur d’enregistrement. Réessayez.')}};r.onstop=()=>{if(g!==recordGeneration)return;const d=(Date.now()-started)/1000;const blob=new Blob(parts,{type:r.mimeType||parts[0]?.type||'video/mp4'});parts.length=0;chunks=[];rec=null;releaseCamera();if(blob.size)loadVideo(blob,d);else say('Aucune vidéo capturée. Réessayez.')};r.start(1000);started=Date.now();$('recordBadge').hidden=false;$('recordTime').textContent='00:00';captureControls();timer=setInterval(()=>{const d=(Date.now()-started)/1000;$('recordTime').textContent=time(d);if(d>=180&&r.state==='recording')r.stop()},200);say('')}catch(e){rec=null;releaseCamera();say('Enregistrement non disponible : essayez une vidéo autorisée.')}}
$('start').onclick=()=>{if(!stream)return;if(videoURL&&!confirm('Remplacer la vidéo et ses observations ?'))return;let n=Number($('countdown').value);$('start').disabled=true;if(!n){beginRecording();return}$('recordBadge').hidden=false;$('recordTime').textContent=n;countTimer=setInterval(()=>{n--;if(n<=0){clearInterval(countTimer);countTimer=null;beginRecording()}else $('recordTime').textContent=n},1000);captureControls()};
$('stop').onclick=()=>{if(rec?.state==='recording'){rec.stop();$('stop').disabled=true;say('Préparation de la vidéo…')}};
function seekTo(n){if(videoURL&&Number.isFinite(n)){try{player.currentTime=Math.max(0,Math.min(length()||n,n))}catch(_){say('Recherche indisponible sur ce format.')}}}
function renderClock(){const d=length();$('now').textContent=time(player.currentTime);$('duration').textContent=time(d);$('seek').max=d||1;$('seek').value=player.currentTime||0;$('cursor').style.left=(d?Math.min(100,player.currentTime/d*100):0)+'%';}
player.ontimeupdate=renderClock;player.ondurationchange=()=>{renderClock();renderNotes()};player.onloadedmetadata=()=>{renderClock();renderNotes()};player.onpause=()=>{$('play').textContent='▶ Lecture'};player.onplay=()=>{$('play').textContent='❚❚ Pause'};player.onerror=()=>{if(videoURL)say('Format vidéo non lisible sur ce navigateur. Essayez une autre vidéo.')};
$('play').onclick=()=>player.paused?player.play().catch(()=>say('Lecture impossible pour ce format.')):player.pause();$('back').onclick=()=>seekTo(player.currentTime-5);$('forward').onclick=()=>seekTo(player.currentTime+5);$('seek').oninput=e=>seekTo(Number(e.target.value));$('speed').onchange=e=>{try{player.playbackRate=Number(e.target.value)}catch(_){say('Vitesse indisponible sur cet appareil.');e.target.value='1'}};
function expandVideo(expanded) {
  document.body.classList.toggle('expanded', expanded);
  $('full').textContent = expanded ? 'Réduire' : 'Agrandir';
  $('full').setAttribute('aria-expanded', String(expanded));
}
$('full').onclick = () => expandVideo(!document.body.classList.contains('expanded'));
function fillCategories(){const visible=Number($('level').value)===0?6:8;$('categories').replaceChildren();data.forEach((c,i)=>{if(i>=visible&&i!==category)return;const b=button(c.short,()=>{selectCategory(i);$('categories').querySelector('.selected')?.focus()},i===category?'selected':'');b.setAttribute('aria-pressed',String(i===category));b.title=c.name;$('categories').append(b)});}
function selectCategory(index, selected = 0) {
  category = index;
  fillCategories();
  const choices = $('criteria');
  choices.replaceChildren();
  data[category].items.forEach(([label], itemIndex) => {
    choices.append(button(label, () => selectCriterion(itemIndex)));
  });
  selectCriterion(selected);
  updateMark();
}

function selectCriterion(index) {
  criterion = index;
  Array.from($('criteria').children).forEach((choice, itemIndex) => {
    const selected = itemIndex === criterion;
    choice.classList.toggle('selected', selected);
    choice.setAttribute('aria-pressed', String(selected));
  });
  $('definition').textContent = data[category].items[criterion][1];
}

$('level').onchange=()=>{resetEditor();selectCategory(0)};
data.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=c.short;$('filter').append(o)});$('filter').onchange=renderNotes;
function updateMark(){$('markTime').textContent=time(mark);$('rangeLabel').textContent=(rangeStart===null?'—':time(rangeStart))+' – '+(rangeEnd===null?'—':time(rangeEnd))}
$('rangeMode').onchange=()=>{$('rangeFields').hidden=!$('rangeMode').checked;rangeStart=null;rangeEnd=null;updateMark()};
$('beginRange').onclick=()=>{if(!videoURL)return;player.pause();rangeStart=player.currentTime;rangeEnd=null;updateMark()};$('endRange').onclick=()=>{if(!videoURL)return;player.pause();rangeEnd=player.currentTime;updateMark()};
function resetEditor(){editing=null;mark=player.currentTime||0;rangeStart=null;rangeEnd=null;$('rangeMode').checked=false;$('rangeFields').hidden=true;$('comment').value='';document.querySelector('input[name=status][value=ok]').checked=true;$('save').textContent='Ajouter le repère';$('editorTitle').textContent='Ajouter un repère';$('annotationOptions').open=false;$('annotationError').textContent='';updateMark()}
function openEditor() {
  $('annotationFeedback').textContent = '';
  $('tools').hidden = false;
  $('annotate').setAttribute('aria-expanded', 'true');
  $('editorTitle').focus({ preventScroll: true });
  $('tools').scrollIntoView({ block: 'nearest' });
}

function closeEditor(returnFocus = false) {
  $('tools').hidden = true;
  $('annotate').setAttribute('aria-expanded', 'false');
  resetEditor();
  if (returnFocus) $('annotate').focus();
}

$('annotate').onclick = () => {
  if (!videoURL) return;
  player.pause();
  if ($('tools').hidden) resetEditor();
  openEditor();
};
$('cancelEdit').onclick = () => closeEditor(true);
$('save').onclick=()=>{if(!videoURL)return;player.pause();const interval=$('rangeMode').checked;if(interval&&(rangeStart===null||rangeEnd===null||rangeEnd<=rangeStart)){$('annotationError').textContent='Choisissez un début et une fin de passage valides.';return}const n={id:editing??(Date.now().toString(36)+Math.random().toString(36).slice(2,8)),category,criterion,start:interval?rangeStart:mark,end:interval?rangeEnd:null,status:document.querySelector('input[name=status]:checked').value,comment:$('comment').value.trim()};if(editing===null)annotations.push(n);else annotations=annotations.map(a=>a.id===editing?n:a);if(n.status==='ok')priorities.delete(n.id);closeEditor(true);renderNotes();$('annotationFeedback').textContent='Repère enregistré.'};
function edit(a){show('analyze');player.pause();seekTo(a.start);editing=a.id;selectCategory(a.category,a.criterion);mark=a.start;rangeStart=a.end===null?null:a.start;rangeEnd=a.end;$('rangeMode').checked=a.end!==null;$('rangeFields').hidden=a.end===null;$('comment').value=a.comment;document.querySelector('input[name=status][value='+a.status+']').checked=true;$('save').textContent='Enregistrer la modification';$('editorTitle').textContent='Modifier le repère';$('annotationOptions').open=a.end!==null||Boolean(a.comment);updateMark();openEditor()}
function label(a){return data[a.category].items[a.criterion][0]}function renderNotes(){const selected=$('filter').value;const filtered=annotations.filter(a=>selected===''||Number(selected)===a.category).sort((a,b)=>a.start-b.start);$('notes').replaceChildren();$('timeline').querySelectorAll('.marker').forEach(x=>x.remove());const d=length();for(const a of filtered){if(d>0){const m=button('',()=>{player.pause();seekTo(a.start)},'marker');m.style.left=Math.min(100,Math.max(0,a.start/d*100))+'%';m.style.setProperty('--marker',states[a.status].color);m.title=time(a.start)+' · '+label(a);m.setAttribute('aria-label',m.title);$('timeline').append(m)}const row=document.createElement('div');row.className='note';const b=button(time(a.start)+(a.end===null?'':' – '+time(a.end))+' · '+label(a),()=>{player.pause();seekTo(a.start)},'jump');const small=document.createElement('small');small.textContent=data[a.category].short+' · '+states[a.status].label+(a.comment?' · '+a.comment:'');b.append(small);row.append(b,button('Modifier',()=>edit(a)),button('×',()=>{annotations=annotations.filter(x=>x.id!==a.id);priorities.delete(a.id);if(editing===a.id)closeEditor();renderNotes()}));row.lastChild.setAttribute('aria-label','Supprimer '+label(a));$('notes').append(row)}if(!filtered.length){const p=document.createElement('p');p.className='muted';p.textContent='Aucun repère pour ce critère.';$('notes').append(p)}$('timeline').hidden=!d||!filtered.length;$('notesPanel').hidden=!annotations.length}
function renderSummary(){$('summary').replaceChildren();for(const [key,s] of Object.entries(states)){const art=document.createElement('article');art.className=key;const h=document.createElement('h3');const found=annotations.filter(a=>a.status===key);h.textContent=s.label+' · '+found.length;art.append(h);const ul=document.createElement('ul');for(const a of found){const li=document.createElement('li');li.textContent=time(a.start)+' · '+label(a);li.append(document.createElement('br'),button('Voir le passage',()=>{show('analyze');player.pause();seekTo(a.start)}));ul.append(li)}if(!found.length){const p=document.createElement('p');p.textContent='Aucune observation saisie.';art.append(p)}else art.append(ul);$('summary').append(art)}$('priorities').replaceChildren();const candidates=annotations.filter(a=>a.status!=='ok');if(!candidates.length){$('priorities').textContent='Ajoutez des éléments à améliorer ou à intégrer.'}for(const a of candidates){const l=document.createElement('label');l.className='check priority';const input=document.createElement('input');input.type='checkbox';input.checked=priorities.has(a.id);input.onchange=()=>{if(input.checked&&priorities.size>=3){input.checked=false;$('priorityError').textContent='Choisissez trois priorités au maximum.';return}$('priorityError').textContent='';if(input.checked)priorities.add(a.id);else priorities.delete(a.id);$('priorityCount').textContent=priorities.size+'/3 priorités sélectionnées'};const t=document.createElement('span');t.textContent=label(a)+' · '+data[a.category].items[a.criterion][1];l.append(input,t);$('priorities').append(l)}$('priorityCount').textContent=priorities.size+'/3 priorités sélectionnées';const visible=Number($('level').value)===0?6:8;$('unobserved').textContent=data.slice(0,visible).filter((_,i)=>!annotations.some(a=>a.category===i)).map(c=>c.name).join(' · ')||'Toutes les catégories ont au moins une observation.'}
$('privacyBtn').onclick=()=>{if($('privacyDialog').showModal)$('privacyDialog').showModal();else $('privacyDialog').setAttribute('open','')};$('closePrivacy').onclick=()=>{if($('privacyDialog').close)$('privacyDialog').close();else $('privacyDialog').removeAttribute('open')};
window.addEventListener('pagehide',()=>{recordGeneration++;if(rec&&rec.state!=='inactive')try{rec.stop()}catch(_){}rec=null;chunks=[];releaseCamera();clearVideo();$('file').value='';captureControls();show('film')});
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').then(reg=>{const offer=()=>{if(reg.waiting&&navigator.serviceWorker.controller){waitingWorker=reg.waiting;$('update').hidden=false}};offer();reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',offer)});$('update').onclick=()=>{if(!waitingWorker)return;if(rec&&rec.state!=='inactive'||countTimer){say('Terminez la captation avant la mise à jour.');return}if((videoURL||stream)&&!confirm('La mise à jour effacera la séance. Continuer ?'))return;resetSession();navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});waitingWorker.postMessage('ACTIVATE')}}).catch(()=>say('Mode hors connexion non disponible pour le moment.'))}
selectCategory(0);controls();renderNotes();renderClock();