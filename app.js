'use strict';
const $=id=>document.getElementById(id);
const data = [
  { short: 'TEMPS', items: ['Lent / rapide', 'Accélération / décélération', 'Immobilité', 'Rupture de rythme', 'Accord avec la musique'] },
  { short: 'ESPACE', items: ['Directions', 'Trajectoires', 'Niveaux haut / moyen / bas', 'Occupation de la scène', 'Formations', 'Changement de formation'] },
  { short: 'ÉNERGIE', items: ['Fluide', 'Saccadé', 'Léger', 'Lourd', 'Explosif', 'Contraste d’énergie'] },
  { short: 'RELATION', items: ['Regards', 'Contact', 'Proximité / éloignement', 'Action / réaction', 'Porté'] },
  { short: 'CORPS', items: ['Amplitude', 'Dissociation', 'Équilibre / déséquilibre', 'Appuis', 'Parties du corps mobilisées'] },
  { short: 'PROCÉDÉ', items: ['Unisson', 'Canon', 'Répétition', 'Miroir', 'Accumulation', 'Alternance', 'Question-réponse'] }
];
let selectionGesture = null;
let selectionArea = null;
const target = $('videoTarget');
let annotations=[],category=0,mark=0,editing=null,videoURL=null,stream=null,rec=null,chunks=[],timer=null,countTimer=null,cameraToken=0,started=0,view='film',waitingWorker=null,recordGeneration=0,knownDuration=0;
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
    renderSummary();
  }
  document.body.classList.toggle('analyzing', view === 'analyze');
  setNotesOpen(false);
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
function clearVideo(){player.pause();player.removeAttribute('src');player.load();if(videoURL)URL.revokeObjectURL(videoURL);videoURL=null;knownDuration=0;annotations=[];$('teacherReport').value='';closeEditor();$('annotationFeedback').textContent='';controls();renderNotes();renderClock()}
function resetSession(){recordGeneration++;if(rec&&rec.state!=='inactive'){try{rec.stop()}catch(_){}}rec=null;chunks=[];releaseCamera();clearVideo();$('file').value='';$('audio').checked=false;captureControls();$('filter').value='';show('film');say('Séance effacée.')}
$('reset').onclick=()=>{if(confirm('Effacer la vidéo, les repères et le bilan de cette séance ?'))resetSession()};
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
$('file').onchange=()=>{const f=$('file').files[0];if(!f)return;if(rec&&rec.state!=='inactive'||countTimer){say('Terminez la captation en cours.');$('file').value='';return}if(f.size>250*1024*1024){say('Vidéo trop volumineuse (250 Mo maximum).');$('file').value='';return}if(videoURL&&!confirm('Remplacer la vidéo ? Les repères et le bilan seront effacés.')){$('file').value='';return}releaseCamera();loadVideo(f);$('file').value=''};
function beginRecording(){if(!stream)return;const g=++recordGeneration;const parts=[];try{const types=['video/mp4','video/webm;codecs=vp8','video/webm'];const type=types.find(t=>MediaRecorder.isTypeSupported?.(t));const options={videoBitsPerSecond:2200000};if(type)options.mimeType=type;const r=new MediaRecorder(stream,options);rec=r;chunks=parts;r.ondataavailable=e=>{if(g===recordGeneration&&e.data.size)parts.push(e.data)};r.onerror=()=>{if(g===recordGeneration){recordGeneration++;rec=null;chunks=[];releaseCamera();say('Erreur d’enregistrement. Réessayez.')}};r.onstop=()=>{if(g!==recordGeneration)return;const d=(Date.now()-started)/1000;const blob=new Blob(parts,{type:r.mimeType||parts[0]?.type||'video/mp4'});parts.length=0;chunks=[];rec=null;releaseCamera();if(blob.size)loadVideo(blob,d);else say('Aucune vidéo capturée. Réessayez.')};r.start(1000);started=Date.now();$('recordBadge').hidden=false;$('recordTime').textContent='00:00';captureControls();timer=setInterval(()=>{const d=(Date.now()-started)/1000;$('recordTime').textContent=time(d);if(d>=180&&r.state==='recording')r.stop()},200);say('')}catch(e){rec=null;releaseCamera();say('Enregistrement non disponible : essayez une vidéo autorisée.')}}
$('start').onclick=()=>{if(!stream)return;if(videoURL&&!confirm('Remplacer la vidéo ? Les repères et le bilan seront effacés.'))return;let n=Number($('countdown').querySelector(':checked').value);$('start').disabled=true;if(!n){beginRecording();return}$('recordBadge').hidden=false;$('recordTime').textContent=n;countTimer=setInterval(()=>{n--;if(n<=0){clearInterval(countTimer);countTimer=null;beginRecording()}else $('recordTime').textContent=n},1000);captureControls()};
$('stop').onclick=()=>{if(rec?.state==='recording'){rec.stop();$('stop').disabled=true;say('Préparation de la vidéo…')}};
function seekTo(n){if(videoURL&&Number.isFinite(n)){try{player.currentTime=Math.max(0,Math.min(length()||n,n))}catch(_){say('Recherche indisponible sur ce format.')}}}
function renderClock(){const d=length();$('now').textContent=time(player.currentTime);$('duration').textContent=time(d);$('seek').max=d||1;$('seek').value=player.currentTime||0;$('cursor').style.left=(d?Math.min(100,player.currentTime/d*100):0)+'%';}
player.ontimeupdate = renderClock;
player.ondurationchange = () => { renderClock(); renderNotes(); };
player.onloadedmetadata = player.ondurationchange;
player.onpause = () => { $('play').textContent = '▶ Lecture'; };
player.onplay = () => {
  closeEditor();
  $('play').textContent = '❚❚ Pause';
};
player.onerror = () => {
  if (videoURL) say('Format vidéo non lisible sur ce navigateur. Essayez une autre vidéo.');
};
$('play').onclick = () => {
  if (player.paused) player.play().catch(() => say('Lecture impossible pour ce format.'));
  else player.pause();
};
$('back').onclick = () => seekTo(player.currentTime - 5);
$('forward').onclick = () => seekTo(player.currentTime + 5);
$('seek').oninput = event => seekTo(Number(event.target.value));
$('speed').onchange = event => {
  try { player.playbackRate = Number(event.target.value); }
  catch (_) { say('Vitesse indisponible sur cet appareil.'); }
};

function selectScene(area = null) {
  if (!videoURL) return;
  player.pause();
  closeEditor();
  setNotesOpen(false);
  selectionArea = area;
  $('annotationFeedback').textContent = '';
  $('categories').hidden = false;
  $('selectionHint').hidden = true;
}

function videoFrame() {
  const bounds = target.getBoundingClientRect();
  if (!bounds.width || !bounds.height || !player.videoWidth || !player.videoHeight) return null;
  const scale = Math.min(bounds.width / player.videoWidth, bounds.height / player.videoHeight);
  const width = player.videoWidth * scale;
  const height = player.videoHeight * scale;
  const left = (bounds.width - width) / 2;
  const top = (bounds.height - height) / 2;
  return { x: bounds.left + left, y: bounds.top + top, left, top, width, height };
}

function gestureArea(event, gesture) {
  const { frame, start } = gesture;
  const x = Math.max(0, Math.min(1, (event.clientX - frame.x) / frame.width));
  const y = Math.max(0, Math.min(1, (event.clientY - frame.y) / frame.height));
  const width = Math.abs(x - start.x);
  const height = Math.abs(y - start.y);
  if (width * frame.width < 8 || height * frame.height < 8) {
    return { ...start, width: 0, height: 0 };
  }
  return { x: Math.min(start.x, x), y: Math.min(start.y, y), width, height };
}

function clearGesture() {
  selectionGesture = null;
  $('dragPreview').hidden = true;
}

target.onpointerdown = event => {
  if (!videoURL || !event.isPrimary || event.button !== 0) return;
  const frame = videoFrame();
  if (!frame) return;
  const x = (event.clientX - frame.x) / frame.width;
  const y = (event.clientY - frame.y) / frame.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  player.pause();
  selectionGesture = { id: event.pointerId, frame, start: { x, y } };
  target.setPointerCapture(event.pointerId);
};

target.onpointermove = event => {
  if (selectionGesture?.id !== event.pointerId) return;
  const area = gestureArea(event, selectionGesture);
  const preview = $('dragPreview');
  preview.hidden = !area.width;
  if (preview.hidden) return;
  const { frame } = selectionGesture;
  preview.style.left = frame.left + area.x * frame.width + 'px';
  preview.style.top = frame.top + area.y * frame.height + 'px';
  preview.style.width = area.width * frame.width + 'px';
  preview.style.height = area.height * frame.height + 'px';
};

target.onpointerup = event => {
  if (selectionGesture?.id !== event.pointerId) return;
  selectScene(gestureArea(event, selectionGesture));
};
target.onlostpointercapture = event => {
  if (selectionGesture?.id === event.pointerId) clearGesture();
};
target.onpointercancel = target.onlostpointercapture;
window.addEventListener('resize', clearGesture);

$('wholeScene').onclick = () => {
  selectScene();
  $('categories').firstElementChild?.focus({ preventScroll: true });
};

function fillCategories() {
  const visible = Number($('level').querySelector(':checked').value) === 0 ? 3 : data.length;
  const editorOpen = !$('tools').hidden;
  $('categories').replaceChildren();
  data.forEach((item, index) => {
    const selected = editorOpen && index === category;
    if (index >= visible && !selected) return;
    const choice = button(item.short, () => {
      if (!videoURL) return;
      player.pause();
      if (!editing) seekTo(mark);
      setNotesOpen(false);
      $('tools').hidden = false;
      selectCategory(index);
      openEditor();
    }, selected ? 'selected' : '');
    choice.setAttribute('aria-controls', 'tools');
    choice.setAttribute('aria-expanded', String(selected));
    $('categories').append(choice);
  });
}

function selectCategory(index, selected = null) {
  category = index;
  $('tools').setAttribute('aria-label', data[index].short);
  fillCategories();
  const choices = $('criteria');
  choices.replaceChildren();
  data[category].items.forEach((label, itemIndex) => {
    const choice = button(label, () => saveObservation(itemIndex), itemIndex === selected ? 'selected' : '');
    choices.append(choice);
  });
}

$('level').onchange = () => closeEditor();
data.forEach((item, index) => {
  const option = document.createElement('option');
  option.value = index;
  option.textContent = item.short;
  $('filter').append(option);
});
$('filter').onchange = renderNotes;

function openEditor() {
  $('annotationFeedback').textContent = '';
  $('tools').scrollTop = 0;
  $('criteria').firstElementChild?.focus({ preventScroll: true });
}

function closeEditor(returnFocus = false) {
  $('tools').hidden = true;
  $('categories').hidden = true;
  $('selectionHint').hidden = false;
  clearGesture();
  selectionArea = null;
  editing = null;
  mark = player.currentTime || 0;
  fillCategories();
  if (returnFocus) $('wholeScene').focus({ preventScroll: true });
}

function setNotesOpen(open) {
  $('notesPanel').hidden = !open || !annotations.length;
  $('toggleNotes').setAttribute('aria-expanded', String(!$('notesPanel').hidden));
}

$('toggleNotes').onclick = () => {
  const open = $('notesPanel').hidden;
  if (open) closeEditor();
  setNotesOpen(open);
  (open ? $('closeNotes') : $('toggleNotes')).focus({ preventScroll: true });
};
$('closeNotes').onclick = () => {
  setNotesOpen(false);
  $('toggleNotes').focus({ preventScroll: true });
};
$('cancelEdit').onclick = () => closeEditor(true);
function saveObservation(criterion) {
  if (!videoURL || $('tools').hidden) return;
  player.pause();
  const observation = {
    id: editing ?? (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
    category,
    criterion,
    start: mark,
    area: selectionArea
  };
  if (editing === null) annotations.push(observation);
  else annotations = annotations.map(item => item.id === editing ? { ...item, ...observation } : item);
  closeEditor(true);
  renderNotes();
  $('annotationFeedback').textContent = 'Repère enregistré.';
}

function edit(observation) {
  show('analyze');
  player.pause();
  seekTo(observation.start);
  editing = observation.id;
  mark = observation.start;
  selectionArea = observation.area ?? null;
  $('categories').hidden = false;
  $('selectionHint').hidden = true;
  $('tools').hidden = false;
  selectCategory(observation.category, observation.criterion);
  openEditor();
}

function label(a){return data[a.category].items[a.criterion]}function renderNotes(){const selected=$('filter').value;const filtered=annotations.filter(a=>selected===''||Number(selected)===a.category).sort((a,b)=>a.start-b.start);$('notes').replaceChildren();$('timeline').querySelectorAll('.marker').forEach(x=>x.remove());const d=length();for(const a of filtered){if(d>0){const m=button('',()=>jumpToObservation(a),'marker');m.style.left=Math.min(100,Math.max(0,a.start/d*100))+'%';m.title=time(a.start)+' · '+label(a);m.setAttribute('aria-label',m.title);$('timeline').append(m)}const row=document.createElement('div');row.className='note';const b=button(time(a.start)+' · '+label(a),()=>jumpToObservation(a),'jump');const small=document.createElement('small');small.textContent=data[a.category].short;b.append(small);row.append(b,button('Modifier',()=>edit(a)),button('×',()=>{annotations=annotations.filter(x=>x.id!==a.id);if(editing===a.id)closeEditor();renderNotes()}));row.lastChild.setAttribute('aria-label','Supprimer '+label(a));$('notes').append(row)}if(!filtered.length){const p=document.createElement('p');p.className='muted';p.textContent='Aucun repère pour ce critère.';$('notes').append(p)}$('timeline').hidden=!d||!filtered.length;$('toggleNotes').hidden=!annotations.length;if(!annotations.length)setNotesOpen(false)}
function jumpToObservation(observation) {
  closeEditor();
  player.pause();
  mark = observation.start;
  seekTo(mark);
}

function renderReadiness() {
  const positive = annotations.filter(item => item.assessment === 'positive').length;
  const improve = annotations.filter(item => item.assessment === 'improve').length;
  const total = annotations.length + 2;
  const positiveShare = (positive + Number(positive > 0)) / total;
  const improveShare = (improve + Number(improve > 0)) / total;
  const complete = positive + improve === annotations.length && positive > 0 && improve > 0;
  const percent = complete ? 100 : Math.floor((positiveShare + improveShare) * 100);
  $('readinessChart').style.setProperty('--positive', positiveShare + 'turn');
  $('readinessChart').style.setProperty('--classified', (positiveShare + improveShare) + 'turn');
  $('readinessPercent').textContent = percent + ' %';
  $('readinessStatus').textContent = complete ? '100 % · Prêt pour l’évaluation' : percent + ' % · Préparation en cours';
  $('readinessCounts').textContent = positive + ' positifs · ' + improve + ' à améliorer · ' +
    (annotations.length - positive - improve) + ' à classer';
}

function renderSummary() {
  renderReadiness();
  const summary = $('summary');
  summary.replaceChildren();
  if (!annotations.length) {
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = 'Aucun critère observé.';
    summary.append(message);
    return;
  }

  data.forEach((item, index) => {
    const observed = annotations.filter(observation => observation.category === index)
      .sort((first, second) => first.start - second.start);
    if (!observed.length) return;
    const group = document.createElement('section');
    const heading = document.createElement('h4');
    heading.textContent = item.short;
    const list = document.createElement('ul');
    for (const observation of observed) {
      const row = document.createElement('li');
      row.append(button(time(observation.start) + ' · ' + label(observation), () => {
        show('analyze');
        jumpToObservation(observation);
      }));
      const assessment = document.createElement('select');
      assessment.setAttribute('aria-label', 'Classer ' + label(observation) + ' à ' + time(observation.start));
      for (const [value, text] of [['', 'À classer'], ['positive', 'Point positif'], ['improve', 'À améliorer']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        assessment.append(option);
      }
      assessment.value = observation.assessment ?? '';
      assessment.onchange = () => {
        observation.assessment = assessment.value;
        renderReadiness();
      };
      row.append(assessment);
      list.append(row);
    }
    group.append(heading, list);
    summary.append(group);
  });
}

$('privacyBtn').onclick=()=>{if($('privacyDialog').showModal)$('privacyDialog').showModal();else $('privacyDialog').setAttribute('open','')};$('closePrivacy').onclick=()=>{if($('privacyDialog').close)$('privacyDialog').close();else $('privacyDialog').removeAttribute('open')};
window.addEventListener('pagehide',()=>{recordGeneration++;if(rec&&rec.state!=='inactive')try{rec.stop()}catch(_){}rec=null;chunks=[];releaseCamera();clearVideo();$('file').value='';captureControls();show('film')});
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').then(reg=>{const offer=()=>{if(reg.waiting&&navigator.serviceWorker.controller){waitingWorker=reg.waiting;$('update').hidden=false}};offer();reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',offer)});$('update').onclick=()=>{if(!waitingWorker)return;if(rec&&rec.state!=='inactive'||countTimer){say('Terminez la captation avant la mise à jour.');return}if((videoURL||stream)&&!confirm('La mise à jour effacera la séance. Continuer ?'))return;resetSession();navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});waitingWorker.postMessage('ACTIVATE')}}).catch(()=>say('Mode hors connexion non disponible pour le moment.'))}
fillCategories();controls();renderNotes();renderClock();