// Data schema in localStorage
// subjects: [{id, name, created}]
// attendance: [{id, date:'YYYY-MM-DD', subjectId, status: 'present'|'absent'|'leave'}]

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const todayStr = () => new Date().toISOString().slice(0,10);

const state = {
  subjects: JSON.parse(localStorage.getItem('subjects')||'[]'),
  attendance: JSON.parse(localStorage.getItem('attendance')||'[]'),
  goal: Number(localStorage.getItem('goal')||75)
};

// Elements
const tabs = $$('.tab-btn');
const sections = $$('.tab');
tabs.forEach(btn=>btn.addEventListener('click', ()=>{
  tabs.forEach(b=>b.classList.remove('active'));
  sections.forEach(sec=>sec.classList.remove('active'));
  btn.classList.add('active');
  $('#'+btn.dataset.tab).classList.add('active');
}));

// Subjects
const subForm = $('#subjectForm');
const subName = $('#subName');
const subList = $('#subjectList');
const entrySubject = $('#entrySubject');
const reportSubject = $('#reportSubject');

function save(){
  localStorage.setItem('subjects', JSON.stringify(state.subjects));
  localStorage.setItem('attendance', JSON.stringify(state.attendance));
  localStorage.setItem('goal', String(state.goal));
}

function uid(){ return crypto.randomUUID(); }

function renderSubjects(){
  subList.innerHTML = '';
  entrySubject.innerHTML = '';
  reportSubject.innerHTML = '<option value="">All Subjects</option>';
  state.subjects.forEach(s=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(s.name)}</span>
      <span class="badge">ID: ${s.id.slice(0,6)}</span>
      <div>
        <button class="ghost" data-edit="${s.id}">Edit</button>
        <button class="ghost" data-del="${s.id}">Delete</button>
      </div>`;
    subList.appendChild(li);
    const opt = new Option(s.name, s.id);
    entrySubject.add(opt.cloneNode(true));
    reportSubject.add(new Option(s.name, s.id));
  });
  if(state.subjects.length===0){
    const p = document.createElement('p');
    p.style.opacity = .8;
    p.textContent = 'No subjects yet — add your first subject.';
    subList.appendChild(p);
  }
}
subForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const name = subName.value.trim();
  if(!name) return;
  state.subjects.push({id: uid(), name, created: Date.now()});
  subName.value='';
  save(); renderSubjects(); renderEntryTable(); renderReport();
});
subList.addEventListener('click', (e)=>{
  const editId = e.target.getAttribute('data-edit');
  const delId = e.target.getAttribute('data-del');
  if(editId){
    const s = state.subjects.find(x=>x.id===editId);
    const newName = prompt('Rename subject:', s.name);
    if(newName!==null && newName.trim()){
      s.name = newName.trim(); save(); renderSubjects(); renderEntryTable(); renderReport();
    }
  } else if(delId){
    if(confirm('Delete this subject and its entries?')){
      state.subjects = state.subjects.filter(x=>x.id!==delId);
      state.attendance = state.attendance.filter(a=>a.subjectId!==delId);
      save(); renderSubjects(); renderEntryTable(); renderReport();
    }
  }
});

// Entry
const dateInput = $('#dateInput');
const saveEntryBtn = $('#saveEntry');
const deleteEntryBtn = $('#deleteEntry');
const dayTableBody = $('#dayTable tbody');
dateInput.value = todayStr();

function selectedStatus(){
  const r = document.querySelector('input[name="status"]:checked');
  return r ? r.value : 'present';
}

saveEntryBtn.addEventListener('click', ()=>{
  const date = dateInput.value || todayStr();
  const subId = entrySubject.value;
  if(!subId){ alert('Please select a subject.'); return; }
  const status = selectedStatus();
  // Keep one record per date+subject (upsert)
  const ex = state.attendance.find(a=>a.date===date && a.subjectId===subId);
  if(ex){
    ex.status = status;
  }else{
    state.attendance.push({id: uid(), date, subjectId: subId, status});
  }
  save(); renderEntryTable(); renderReport();
});

deleteEntryBtn.addEventListener('click', ()=>{
  const date = dateInput.value || todayStr();
  const subId = entrySubject.value;
  if(!subId){ alert('Select a subject to delete this day\'s entry.'); return; }
  const before = state.attendance.length;
  state.attendance = state.attendance.filter(a=>!(a.date===date && a.subjectId===subId));
  const removed = before - state.attendance.length;
  if(removed===0) alert('No entry found for this subject on selected date.');
  save(); renderEntryTable(); renderReport();
});

dateInput.addEventListener('change', ()=>{ renderEntryTable(); });

function renderEntryTable(){
  dayTableBody.innerHTML = '';
  const date = dateInput.value || todayStr();
  const rows = [];
  for(const s of state.subjects){
    const rec = state.attendance.find(a=>a.date===date && a.subjectId===s.id);
    const status = rec ? rec.status : '—';
    const cls = status==='present'?'status-present':status==='absent'?'status-absent':status==='leave'?'status-leave':'';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(s.name)}</td><td class="${cls}">${status}</td>`;
    rows.push(tr);
  }
  if(rows.length===0){
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="2" style="opacity:.8">Add subjects first.</td>';
    rows.push(tr);
  }
  rows.forEach(r=>dayTableBody.appendChild(r));
}

// Report
const fromDate = $('#fromDate');
const toDate = $('#toDate');
const reportTableBody = $('#reportTable tbody');
const totalClasses = $('#totalClasses');
const presentCount = $('#presentCount');
const absentCount = $('#absentCount');
const leaveCount = $('#leaveCount');
const percentEl = $('#percent');
const goalStatus = $('#goalStatus');
const goalInput = $('#goalInput');

goalInput.value = state.goal;
goalInput.addEventListener('input', ()=>{
  state.goal = Math.max(0, Math.min(100, Number(goalInput.value||0)));
  save(); renderReport();
});
reportSubject.addEventListener('change', renderReport);
[fromDate, toDate].forEach(el=>el.addEventListener('change', renderReport));

function inRange(dateStr, from, to){
  if(from && dateStr < from) return false;
  if(to && dateStr > to) return false;
  return true;
}

function renderReport(){
  // populate subject dropdowns if empty
  if(entrySubject.options.length===0) renderSubjects();

  const subFilter = reportSubject.value;
  const from = fromDate.value || null;
  const to = toDate.value || null;

  const rows = state.attendance
    .filter(a=>(!subFilter || a.subjectId===subFilter) && inRange(a.date, from, to))
    .sort((a,b)=>a.date.localeCompare(b.date));

  reportTableBody.innerHTML = '';
  let present=0, absent=0, leave=0, total=0;
  const subById = Object.fromEntries(state.subjects.map(s=>[s.id,s]));

  for(const r of rows){
    total++;
    if(r.status==='present') present++;
    else if(r.status==='absent') absent++;
    else if(r.status==='leave') leave++;

    const tr = document.createElement('tr');
    const cls = r.status==='present'?'status-present':r.status==='absent'?'status-absent':'status-leave';
    tr.innerHTML = `<td>${r.date}</td><td>${escapeHtml(subById[r.subjectId]?.name||'Unknown')}</td><td class="${cls}">${r.status}</td>`;
    reportTableBody.appendChild(tr);
  }

  totalClasses.textContent = total;
  presentCount.textContent = present;
  absentCount.textContent = absent;
  leaveCount.textContent = leave;
  const pct = total? Math.round((present/total)*100):0;
  percentEl.textContent = pct + '%';
  if(total===0){ goalStatus.textContent = 'No data'; goalStatus.style.color=''; }
  else if(pct >= state.goal){ goalStatus.textContent = 'On Track'; goalStatus.style.color = '#8ae6a1'; }
  else { goalStatus.textContent = 'Below Goal'; goalStatus.style.color = '#ff9e9e'; }
}

// Utils
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// PWA install prompt
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  installBtn.hidden = true;
  if(deferredPrompt){
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
});

// Initial render
renderSubjects();
renderEntryTable();
renderReport();
