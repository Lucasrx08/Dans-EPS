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
const observationPrompts = [
  'Suis le trajet des danseurs. Où vont-ils et à quelle hauteur évoluent-ils ?',
  'Regarde le groupe dans son ensemble. Quelle forme dessinent les placements ?',
  'Repère un geste qui interrompt la danse ou détourne l’attention.',
  'Cherche la phrase imposée. Comment le groupe la reprend-il ?',
  'Compare les vitesses et les arrêts. Qu’est-ce qui change dans le rythme ?',
  'Compare le moment où chacun bouge. Comment les mouvements se répondent-ils ?',
  'Regarde l’amplitude des gestes et les changements d’énergie.',
  'Observe comment les danseurs relient les passages ou interagissent.'
];
let replay = null;
let zone = null;
let selectionGesture = null;
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
function resetSession(){recordGeneration++;if(rec&&rec.state!=='inactive'){try{rec.stop()}catch(_){}}rec=null;chunks=[];releaseCamera();clearVideo();$('file').value='';$('audio').checked=false;$('captureSettings').open=false;captureControls();$('filter').value='';show('film');say('Séance effacée.')}
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
$('start').onclick=()=>{if(!stream)return;if(videoURL&&!confirm('Remplacer la vidéo ? Les repères et le bilan seront effacés.'))return;let n=Number($('countdown').value);$('start').disabled=true;if(!n){beginRecording();return}$('recordBadge').hidden=false;$('recordTime').textContent=n;countTimer=setInterval(()=>{n--;if(n<=0){clearInterval(countTimer);countTimer=null;beginRecording()}else $('recordTime').textContent=n},1000);captureControls()};
$('stop').onclick=()=>{if(rec?.state==='recording'){rec.stop();$('stop').disabled=true;say('Préparation de la vidéo…')}};
function seekTo(n){if(videoURL&&Number.isFinite(n)){try{player.currentTime=Math.max(0,Math.min(length()||n,n))}catch(_){say('Recherche indisponible sur ce format.')}}}
function renderClock(){const d=length();$('now').textContent=time(player.currentTime);$('duration').textContent=time(d);$('seek').max=d||1;$('seek').value=player.currentTime||0;$('cursor').style.left=(d?Math.min(100,player.currentTime/d*100):0)+'%';}
player.ontimeupdate = () => {
  renderClock();
  if (replay && !player.seeking && player.currentTime >= replay.end) finishReplay(true);
};
player.onended = () => {
  if (replay) finishReplay(true);
};
player.ondurationchange=()=>{renderClock();renderNotes()};player.onloadedmetadata=()=>{renderClock();renderNotes()};player.onpause=()=>{$('play').textContent='▶ Lecture'};player.onplay=()=>{$('play').textContent='❚❚ Pause'};player.onerror=()=>{finishReplay(false, 'Ralenti indisponible.');if(videoURL)say('Format vidéo non lisible sur ce navigateur. Essayez une autre vidéo.')};
$('play').onclick = () => {
  if (replay) {
    finishReplay(false);
    return;
  }
  if (player.paused) player.play().catch(() => say('Lecture impossible pour ce format.'));
  else player.pause();
};
$('back').onclick = () => { finishReplay(false); seekTo(player.currentTime - 5); };
$('forward').onclick = () => { finishReplay(false); seekTo(player.currentTime + 5); };
$('seek').oninput = event => { finishReplay(false); seekTo(Number(event.target.value)); };
$('speed').onchange = event => {
  finishReplay(false);
  try { player.playbackRate = Number(event.target.value); }
  catch (_) { say('Vitesse indisponible sur cet appareil.'); }
};

$('replay').onclick = () => {
  if (replay || $('tools').hidden) return;
  const target = Math.max(mark, 1);
  const end = Math.min(length() || target, target);
  replay = { end, rate: player.playbackRate };
  const currentReplay = replay;
  $('replay').disabled = true;
  $('replayStatus').textContent = 'Ralenti en cours…';
  try {
    player.playbackRate = 0.5;
    seekTo(Math.max(0, end - 2));
    player.play().catch(() => {
      if (replay === currentReplay) finishReplay(false, 'Ralenti indisponible. Réessaie.');
    });
  } catch (_) {
    finishReplay(false, 'Ralenti indisponible. Réessaie.');
  }
};

function finishReplay(completed, message = '') {
  if (!replay) return;
  const { rate } = replay;
  replay = null;
  player.pause();
  player.playbackRate = rate;
  $('replay').disabled = false;
  $('replayStatus').textContent = message;
  if (completed) {
    seekTo(mark);
    $('observationChoices').hidden = false;
    $('replayStatus').textContent = 'Choisis ce que tu as observé.';
  }
}

function videoBounds() {
  const bounds = target.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const scale = Math.min(bounds.width / player.videoWidth, bounds.height / player.videoHeight);
  const width = player.videoWidth * scale;
  const height = player.videoHeight * scale;
  if (!width || !height) return null;
  return { bounds, width, height, left: (bounds.width - width) / 2, top: (bounds.height - height) / 2 };
}

function videoPoint(event, clamp = false) {
  const frame = videoBounds();
  if (!frame) return null;
  const x = (event.clientX - frame.bounds.left - frame.left) / frame.width;
  const y = (event.clientY - frame.bounds.top - frame.top) / frame.height;
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

function drawZone() {
  const marker = $('zoneMarker');
  const frame = videoBounds();
  marker.hidden = !zone || !frame || !player.paused || Math.abs(player.currentTime - mark) > 0.18;
  if (marker.hidden) return;
  marker.classList.toggle('point', !zone.width && !zone.height);
  marker.style.left = frame.left + zone.x * frame.width + 'px';
  marker.style.top = frame.top + zone.y * frame.height + 'px';
  marker.style.width = zone.width * frame.width + 'px';
  marker.style.height = zone.height * frame.height + 'px';
}

function selectScene(point) {
  if (!videoURL) return;
  finishReplay(false);
  player.pause();
  closeEditor();
  setNotesOpen(false);
  $('annotationFeedback').textContent = '';
  zone = point;
  mark = player.currentTime;
  drawZone();
  $('categories').hidden = false;
  $('selectionHint').hidden = true;
}

target.onpointerdown = event => {
  if (!videoURL || !event.isPrimary || event.button !== 0) return;
  const point = videoPoint(event);
  if (!point) return;
  selectScene({ ...point, width: 0, height: 0 });
  $('categories').hidden = true;
  selectionGesture = { point, id: event.pointerId, x: event.clientX, y: event.clientY };
  target.setPointerCapture(event.pointerId);
};

function updateSelection(event) {
  if (selectionGesture?.id !== event.pointerId) return;
  const end = videoPoint(event, true);
  if (!end) return;
  const start = selectionGesture.point;
  const dragged = Math.hypot(event.clientX - selectionGesture.x, event.clientY - selectionGesture.y) >= 12;
  zone = dragged ? {
    x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y)
  } : { ...start, width: 0, height: 0 };
  drawZone();
}
target.onpointermove = updateSelection;
target.onpointerup = event => {
  if (selectionGesture?.id !== event.pointerId) return;
  updateSelection(event);
  selectionGesture = null;
  $('categories').hidden = false;
};
target.onlostpointercapture = () => { if (selectionGesture) closeEditor(); };
$('wholeScene').onclick = () => {
  selectScene(null);
  $('categories').firstElementChild?.focus({ preventScroll: true });
};
new ResizeObserver(drawZone).observe(target);
player.addEventListener('pause', drawZone);
player.addEventListener('play', drawZone);
player.addEventListener('seeked', drawZone);

function fillCategories() {
  const visible = Number($('level').value) === 0 ? 6 : data.length;
  const editorOpen = !$('tools').hidden;
  $('categories').replaceChildren();
  data.forEach((item, index) => {
    const selected = editorOpen && index === category;
    if (index >= visible && !selected) return;
    const choice = button(item.short, () => {
      if (!videoURL) return;
      finishReplay(false);
      player.pause();
      if (!editing) seekTo(mark);
      setNotesOpen(false);
      $('tools').hidden = false;
      selectCategory(index);
      openEditor();
    }, selected ? 'selected' : '');
    choice.setAttribute('aria-controls', 'tools');
    choice.setAttribute('aria-expanded', String(selected));
    choice.title = item.name;
    $('categories').append(choice);
  });
}

function selectCategory(index, selected = null) {
  category = index;
  $('observationPrompt').textContent = observationPrompts[index];
  $('observationChoices').hidden = selected === null;
  $('replayStatus').textContent = '';
  $('editorTitle').textContent = editing === null ? data[index].short : 'Modifier le repère';
  fillCategories();
  const choices = $('criteria');
  choices.replaceChildren();
  data[category].items.forEach(([label], itemIndex) => {
    const choice = button(label, () => saveObservation(itemIndex), itemIndex === selected ? 'selected' : '');
    choices.append(choice);
  });
  updateMark();
}

$('level').onchange = () => closeEditor();
data.forEach((item, index) => {
  const option = document.createElement('option');
  option.value = index;
  option.textContent = item.short;
  $('filter').append(option);
});
$('filter').onchange = renderNotes;

function updateMark() {
  $('markTime').textContent = time(mark);
}

function resetEditor() {
  editing = null;
  mark = player.currentTime || 0;
  updateMark();
}

function openEditor() {
  $('annotationFeedback').textContent = '';
  $('tools').scrollTop = 0;
  $('editorTitle').focus({ preventScroll: true });
}

function closeEditor(returnFocus = false) {
  finishReplay(false);
  $('tools').hidden = true;
  $('categories').hidden = true;
  $('selectionHint').hidden = false;
  zone = null;
  selectionGesture = null;
  drawZone();
  resetEditor();
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
  if (!videoURL || $('tools').hidden || $('observationChoices').hidden) return;
  finishReplay(false);
  player.pause();
  const observation = {
    id: editing ?? (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
    category,
    criterion,
    start: mark,
    zone
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
  zone = observation.zone ?? null;
  drawZone();
  $('categories').hidden = false;
  $('selectionHint').hidden = true;
  $('tools').hidden = false;
  selectCategory(observation.category, observation.criterion);
  openEditor();
}

function label(a){return data[a.category].items[a.criterion][0]}function renderNotes(){const selected=$('filter').value;const filtered=annotations.filter(a=>selected===''||Number(selected)===a.category).sort((a,b)=>a.start-b.start);$('notes').replaceChildren();$('timeline').querySelectorAll('.marker').forEach(x=>x.remove());const d=length();for(const a of filtered){if(d>0){const m=button('',()=>jumpToObservation(a),'marker');m.style.left=Math.min(100,Math.max(0,a.start/d*100))+'%';m.title=time(a.start)+' · '+label(a);m.setAttribute('aria-label',m.title);$('timeline').append(m)}const row=document.createElement('div');row.className='note';const b=button(time(a.start)+' · '+label(a),()=>jumpToObservation(a),'jump');const small=document.createElement('small');small.textContent=data[a.category].short;b.append(small);row.append(b,button('Modifier',()=>edit(a)),button('×',()=>{annotations=annotations.filter(x=>x.id!==a.id);if(editing===a.id)closeEditor();renderNotes()}));row.lastChild.setAttribute('aria-label','Supprimer '+label(a));$('notes').append(row)}if(!filtered.length){const p=document.createElement('p');p.className='muted';p.textContent='Aucun repère pour ce critère.';$('notes').append(p)}$('timeline').hidden=!d||!filtered.length;$('toggleNotes').hidden=!annotations.length;if(!annotations.length)setNotesOpen(false)}
function jumpToObservation(observation) {
  closeEditor();
  player.pause();
  mark = observation.start;
  seekTo(mark);
  zone = observation.zone ?? null;
  drawZone();
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