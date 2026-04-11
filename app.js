/* ========= Firebase Config ========= */
const firebaseConfig = {
    apiKey: "AIzaSyBF3_iG2b8gYz-qoz4rQV95MrlWQHNPu98",
    authDomain: "taqfela-pro.firebaseapp.com",
    databaseURL: "https://taqfela-pro-default-rtdb.firebaseio.com",
    projectId: "taqfela-pro",
    storageBucket: "taqfela-pro.firebasestorage.app",
    messagingSenderId: "1058350153841",
    appId: "1:1058350153841:web:baeb3fafd8f224ff145bd0",
    measurementId: "G-3TH5EWJ2SV"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ========= Helpers ========= */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const fmtNum = n => Number(n||0).toLocaleString('en-US');
const today = () => new Date().toISOString().slice(0,10);
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const parseK = v => (parseFloat(v)||0)*1000;
const toK = v => (v||0)/1000;

function toast(msg){
    const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');
    setTimeout(()=>t.classList.add('hidden'),2200);
}

/* ========= AUTH ========= */
const AUTH_SESSION_KEY = 'cashier_sub_session';

async function hashPwd(pwd){
    const data=new TextEncoder().encode(pwd);
    const buf=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function getAuthSession(){
    try{return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY))||null;}catch(e){return null;}
}
function setAuthSession(s){ localStorage.setItem(AUTH_SESSION_KEY,JSON.stringify(s)); }
function clearAuthSession(){ localStorage.removeItem(AUTH_SESSION_KEY); }

async function doLogin(){
    const username=$('#loginUser').value.trim();
    const password=$('#loginPass').value;
    const errEl=$('#loginError');
    errEl.style.display='none';
    if(!username||!password){errEl.textContent='أدخل البيانات';errEl.style.display='block';return;}

    try{
        const snap = await db.ref('cashier_accounts').once('value');
        const accounts = snap.val();
        if(!accounts){errEl.textContent='لا توجد حسابات كاشير - تواصل مع المسؤول';errEl.style.display='block';return;}

        const hash = await hashPwd(password);
        let found = null;
        Object.values(accounts).forEach(acc=>{
            if(acc.username===username && acc.passwordHash===hash) found=acc;
        });

        if(!found){errEl.textContent='بيانات خاطئة';errEl.style.display='block';return;}

        if(!found.cashierType || !CASHIERS[found.cashierType]){
            errEl.textContent='لم يتم تعيين نوع كاشير لهذا الحساب';errEl.style.display='block';return;
        }

        setAuthSession({username:found.username,cashierType:found.cashierType});
        $('#loginOverlay').classList.add('hidden');
        pushNavState('home');
        autoSelectCashier(found.cashierType);
    }catch(e){
        console.error('Login error:',e);
        errEl.textContent='خطأ في الاتصال - حاول مرة أخرى';errEl.style.display='block';
    }
}

function autoSelectCashier(cashierType){
    selectedCashier = CASHIERS[cashierType];
    if(!selectedCashier) return;
    localStorage.setItem(SELECTED_KEY, cashierType);
    $('#cashierSelect').classList.add('hidden');
    $('#app').classList.remove('hidden');
    initApp();
}

function logoutCashier(){
    clearAuthSession();
    localStorage.removeItem(SELECTED_KEY);
    selectedCashier = null;
    $('#app').classList.add('hidden');
    $('#cashierSelect').classList.add('hidden');
    $('#loginOverlay').classList.remove('hidden');
    $('#loginUser').value='';
    $('#loginPass').value='';
}

/* ========= Local Storage ========= */
const STORE_KEY = 'cashier_sub_closings';
const PENDING_KEY = 'cashier_sub_pending';
const SELECTED_KEY = 'cashier_sub_selected';

function loadLocal(k){
    try{
        const raw=localStorage.getItem(k);
        if(!raw) return [];
        const parsed=JSON.parse(raw);
        // ensure we always return an array for array keys
        return Array.isArray(parsed)?parsed:(parsed||[]);
    }catch(e){
        console.warn('loadLocal error for',k,e);
        // Try to recover from backup
        try{
            const bak=localStorage.getItem(k+'_bak');
            if(bak){const p=JSON.parse(bak);return Array.isArray(p)?p:[];}
        }catch(e2){}
        return [];
    }
}
function saveLocal(k,v){
    try{
        const str=JSON.stringify(v);
        localStorage.setItem(k,str);
        // Keep a rolling backup for critical keys
        if(k===STORE_KEY){localStorage.setItem(k+'_bak',str);}
    }catch(e){
        console.error('saveLocal error for',k,e);
        if(e.name==='QuotaExceededError'){
            // Try to free space by removing old backup
            localStorage.removeItem(k+'_bak');
            try{localStorage.setItem(k,JSON.stringify(v));}catch(e2){console.error('Save failed even after cleanup',e2);}
        }
    }
}

/* ========= Cashier Data ========= */
const CASHIERS = {
    men:   {key:'men',   label:'كاشير الرجال',  icon:'ri-men-line',      color:'#6366f1'},
    women: {key:'women', label:'كاشير النساء',   icon:'ri-women-line',    color:'#ec4899'},
    cosmetics:{key:'cosmetics',label:'كاشير التجميل',icon:'ri-sparkling-line',color:'#f59e0b'}
};

const FIELDS = [
    {key:'sales',      label:'رصيد الكاشير',    icon:'ri-wallet-3-line',         type:'income'},
    {key:'network',    label:'المبلغ المستلم',   icon:'ri-bank-card-line',        type:'income'},
    {key:'returns',    label:'التخفيضات',        icon:'ri-arrow-go-back-line',    type:'deduct'},
    {key:'expenses',   label:'المصاريف',         icon:'ri-money-dollar-box-line', type:'expense'},
    {key:'lunch',      label:'الغداء',           icon:'ri-restaurant-line',       type:'expense'},
    {key:'debts',      label:'الديون',           icon:'ri-file-list-3-line',      type:'debt'},
    {key:'withdrawals',label:'السحوبات',         icon:'ri-hand-coin-line',        type:'withdraw'}
];

// Steps: manager + 7 fields + summary = 9
const TOTAL_STEPS = FIELDS.length + 2;

let selectedCashier = null;
let wizData = {};
let wizStep = 0;
let isOnline = navigator.onLine;

/* ========= Online/Offline Detection ========= */
window.addEventListener('online', () => { isOnline = true; updateSyncUI(); syncPending(); });
window.addEventListener('offline', () => { isOnline = false; updateSyncUI(); });

function updateSyncUI(){
    const badge = $('#syncStatus');
    if(!badge) return;
    if(isOnline){
        badge.className = 'sync-badge online';
        badge.innerHTML = '<i class="ri-wifi-line"></i>';
    } else {
        badge.className = 'sync-badge offline';
        badge.innerHTML = '<i class="ri-wifi-off-line"></i>';
    }
    updatePendingBanner();
}

function updatePendingBanner(){
    const pending = loadLocal(PENDING_KEY);
    const banner = $('#pendingBanner');
    if(!banner) return;
    if(pending.length > 0){
        banner.style.display = 'flex';
        $('#pendingCount').textContent = pending.length;
    } else {
        banner.style.display = 'none';
    }
}

/* ========= Cashier Selection ========= */
function selectCashier(key){
    selectedCashier = CASHIERS[key];
    if(!selectedCashier) return;
    localStorage.setItem(SELECTED_KEY, key);
    $('#cashierSelect').classList.add('hidden');
    $('#app').classList.remove('hidden');
    initApp();
}

function goBack(){
    logoutCashier();
}

/* ========= Init ========= */
function initApp(){
    if(!selectedCashier) return;
    const c = selectedCashier;

    // Set identity card
    const identity = $('#cashierIdentity');
    identity.setAttribute('data-key', c.key);
    $('#ciIcon').innerHTML = `<i class="${c.icon}"></i>`;
    $('#ciIcon').style.color = c.color;
    $('#ciName').textContent = c.label;

    // Date
    const d = new Date();
    const opts = {weekday:'long',year:'numeric',month:'long',day:'numeric'};
    const dateStr = d.toLocaleDateString('ar-SA', opts);
    $('#ciDate').textContent = dateStr;
    $('#topbarDate').textContent = dateStr;
    $('#topbarTitle').textContent = c.label;

    updateSyncUI();
    renderClosings();

    // Start notification listener
    startCashierNotifListener();
    updateCashierNotifBadge();
}

/* ========= Render Closings ========= */
function renderClosings(){
    if(!selectedCashier) return;
    const all = loadLocal(STORE_KEY);
    const mine = all.filter(c => c.cashierKey === selectedCashier.key).sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const list = $('#closingsList');

    if(!mine.length){
        list.innerHTML = '<div class="empty-state"><i class="ri-inbox-line"></i><p>لا توجد تقفيلات بعد</p></div>';
        return;
    }

    list.innerHTML = mine.map(c => {
        const net = c.data.network || 0;
        const clr = net >= 0 ? 'income' : 'expense';
        const syncBadge = c.synced
            ? '<span class="synced-badge yes"><i class="ri-check-line"></i> مزامن</span>'
            : '<span class="synced-badge no"><i class="ri-time-line"></i> بانتظار</span>';
        return `<div class="record-card">
            <div class="rec-info">
                <div class="rec-title">${c.date}${c.manager ? ' - '+c.manager : ''}</div>
                <div class="rec-sub">${selectedCashier.label} ${syncBadge}</div>
            </div>
            <div class="rec-amount ${clr}">${fmtNum(net)}</div>
        </div>`;
    }).join('');
}

/* ========= Wizard ========= */
function getStepInfo(step){
    if(step === 0) return {type:'manager'};
    const fi = step - 1;
    if(fi >= FIELDS.length) return {type:'summary'};
    return {type:'field', field:FIELDS[fi]};
}

function startWizard(){
    const session = getAuthSession();
    wizData = {manager:session?session.username:'', fields:{}};
    FIELDS.forEach(f => wizData.fields[f.key] = 0);
    wizData.debtsList = [];
    wizData.withdrawList = [];
    wizData.expensesList = [];
    wizStep = 1; /* skip manager step - auto-filled from login */
    renderWizStep();
    $('#wizardOverlay').classList.remove('hidden');
    document.body.classList.add('wizard-open');
    pushNavState('wizard', {step: wizStep});
}

function closeWizard(){
    if(!confirm('هل تريد الخروج من التقفيلة؟')) return;
    $('#wizardOverlay').classList.add('hidden');
    document.body.classList.remove('wizard-open');
}

function wizNext(){
    saveCurrentStep();
    if(wizStep === TOTAL_STEPS - 1){ saveClosing(); return; }
    wizStep++;
    renderWizStep();
    pushNavState('wizard', {step: wizStep});
}

function wizPrev(){
    saveCurrentStep();
    if(wizStep > 0){ wizStep--; renderWizStep(); }
}

function renderWizStep(){
    const info = getStepInfo(wizStep);
    $('#wizProgress').textContent = `${wizStep+1}/${TOTAL_STEPS}`;
    $('#wizProgressFill').style.width = ((wizStep+1)/TOTAL_STEPS*100)+'%';
    $('#wizBack').style.visibility = wizStep === 0 ? 'hidden' : 'visible';
    const isLast = wizStep === TOTAL_STEPS - 1;
    $('#wizNext').innerHTML = isLast ? '<i class="ri-save-line"></i> حفظ وإرسال' : 'التالي <i class="ri-arrow-left-line"></i>';

    const body = $('#wizBody');
    const c = selectedCashier;

    if(info.type === 'manager'){
        body.innerHTML = `
        <div class="wiz-cashier-label" style="color:var(--primary)"><i class="ri-user-star-line"></i> المدير المسؤول</div>
        <input type="text" class="wiz-input" id="wizInput" value="${wizData.manager||''}" placeholder="اسم المدير" style="font-size:1rem">
        <p style="font-size:.8rem;color:var(--text3);margin-top:10px;text-align:center">أدخل اسم المدير المسؤول</p>`;
        setTimeout(()=>{const inp=$('#wizInput');if(inp){inp.focus();}},100);
        return;
    }

    if(info.type === 'summary'){
        renderWizSummary(body);
        return;
    }

    const {field} = info;
    const fk = field.key;
    let extra = '';
    if(fk === 'debts') extra = buildDebtEntryUI();
    else if(fk === 'withdrawals') extra = buildWithdrawEntryUI();
    else if(fk === 'expenses') extra = buildExpenseEntryUI();

    body.innerHTML = `
    <div class="wiz-cashier-label" style="color:${c.color}"><i class="${c.icon}"></i> ${c.label}</div>
    <div class="wiz-label"><i class="${field.icon}"></i> ${field.label} <span style="font-size:.75rem;color:var(--text3)">(بالآلاف)</span></div>
    <input type="number" class="wiz-input" id="wizInput" inputmode="decimal" value="${toK(wizData.fields[fk])||''}" placeholder="0">
    ${extra}`;
    setTimeout(()=>{
        const inp = $('#wizInput');
        if(inp){
            inp.focus();
            inp.addEventListener('keydown', e=>{
                if(e.key==='Enter'){e.preventDefault();$('#wizNext').click();}
            });
        }
    },100);
}

/* ===== Debt Entry ===== */
function buildDebtEntryUI(){
    const list = wizData.debtsList || [];
    let items = list.map((d,i)=>`<div class="debt-item"><span>${d.person}: ${fmtNum(d.amount)}</span><button onclick="removeWizDebt(${i})"><i class="ri-close-circle-line"></i></button></div>`).join('');
    return `<div class="wiz-debt-entry"><h4><i class="ri-file-list-3-line"></i> تفاصيل الديون</h4>
    <input type="text" class="input-field" id="debtPersonInput" placeholder="اسم المدين">
    <input type="number" class="input-field" id="debtAmountInput" placeholder="المبلغ (بالآلاف)" inputmode="decimal" style="margin-top:6px">
    <input type="text" class="input-field" id="debtNoteInput" placeholder="ملاحظة (اختياري)" style="margin-top:6px">
    <button class="btn btn-primary btn-sm btn-block" onclick="addWizDebt()" style="margin-top:8px"><i class="ri-add-line"></i> إضافة دين</button>
    <div class="debt-list">${items}</div></div>`;
}
function addWizDebt(){
    const person = $('#debtPersonInput')?.value?.trim();
    const amount = parseK($('#debtAmountInput')?.value);
    const note = $('#debtNoteInput')?.value || '';
    if(!person) return toast('أدخل اسم المدين');
    if(!amount) return toast('أدخل المبلغ');
    wizData.debtsList.push({person, amount, note});
    const total = wizData.debtsList.reduce((s,d)=>s+d.amount,0);
    wizData.fields.debts = total;
    renderWizStep();
}
function removeWizDebt(i){
    wizData.debtsList.splice(i,1);
    const total = wizData.debtsList.reduce((s,d)=>s+d.amount,0);
    wizData.fields.debts = total;
    renderWizStep();
}

/* ===== Expense Entry ===== */
function buildExpenseEntryUI(){
    const list = wizData.expensesList || [];
    let items = list.map((e,i)=>`<div class="debt-item"><span>${e.desc||'مصروف'}: ${fmtNum(e.amount)}</span><button onclick="removeWizExpense(${i})"><i class="ri-close-circle-line"></i></button></div>`).join('');
    return `<div class="wiz-debt-entry"><h4><i class="ri-money-dollar-box-line"></i> تفاصيل المصاريف</h4>
    <input type="number" class="input-field" id="expEntryAmountInput" placeholder="المبلغ (بالآلاف)" inputmode="decimal">
    <input type="text" class="input-field" id="expEntryDescInput" placeholder="وصف المصروف" style="margin-top:6px">
    <button class="btn btn-primary btn-sm btn-block" onclick="addWizExpense()" style="margin-top:8px"><i class="ri-add-line"></i> إضافة مصروف</button>
    <div class="debt-list">${items}</div></div>`;
}
function addWizExpense(){
    const amount = parseK($('#expEntryAmountInput')?.value);
    const desc = $('#expEntryDescInput')?.value || '';
    if(!amount) return toast('أدخل المبلغ');
    wizData.expensesList.push({amount, desc});
    const total = wizData.expensesList.reduce((s,e)=>s+e.amount,0);
    wizData.fields.expenses = total;
    renderWizStep();
}
function removeWizExpense(i){
    wizData.expensesList.splice(i,1);
    const total = wizData.expensesList.reduce((s,e)=>s+e.amount,0);
    wizData.fields.expenses = total;
    renderWizStep();
}

/* ===== Withdraw Entry ===== */
function buildWithdrawEntryUI(){
    const list = wizData.withdrawList || [];
    let items = list.map((w,i)=>`<div class="withdraw-item"><span>${w.person}: ${fmtNum(w.amount)}</span><button onclick="removeWizWithdraw(${i})"><i class="ri-close-circle-line"></i></button></div>`).join('');
    return `<div class="wiz-withdraw-entry"><h4><i class="ri-hand-coin-line"></i> تفاصيل السحوبات</h4>
    <input type="text" class="input-field" id="withdrawPersonInput" placeholder="اسم الشخص">
    <input type="number" class="input-field" id="withdrawAmountInput" placeholder="المبلغ (بالآلاف)" inputmode="decimal" style="margin-top:6px">
    <input type="text" class="input-field" id="withdrawNoteInput" placeholder="ملاحظة (اختياري)" style="margin-top:6px">
    <button class="btn btn-primary btn-sm btn-block" onclick="addWizWithdraw()" style="margin-top:8px"><i class="ri-add-line"></i> إضافة سحب</button>
    <div class="withdraw-list">${items}</div></div>`;
}
function addWizWithdraw(){
    const person = $('#withdrawPersonInput')?.value?.trim();
    const amount = parseK($('#withdrawAmountInput')?.value);
    const note = $('#withdrawNoteInput')?.value || '';
    if(!person) return toast('أدخل اسم الشخص');
    if(!amount) return toast('أدخل المبلغ');
    wizData.withdrawList.push({person, amount, note});
    const total = wizData.withdrawList.reduce((s,w)=>s+w.amount,0);
    wizData.fields.withdrawals = total;
    renderWizStep();
}
function removeWizWithdraw(i){
    wizData.withdrawList.splice(i,1);
    const total = wizData.withdrawList.reduce((s,w)=>s+w.amount,0);
    wizData.fields.withdrawals = total;
    renderWizStep();
}

/* ===== Wizard Summary ===== */
function renderWizSummary(body){
    const c = selectedCashier;
    const d = wizData.fields;
    const net = d.network || 0;
    const deductions = (d.returns||0) + (d.expenses||0) + (d.lunch||0) + (d.debts||0) + (d.withdrawals||0);
    const expected = (d.sales||0) - deductions;
    const diff = net - expected;

    let html = `<div class="wiz-summary">`;
    if(wizData.manager){
        html += `<div style="text-align:center;font-weight:700;color:var(--primary);margin-bottom:10px"><i class="ri-user-star-line"></i> المدير: ${wizData.manager}</div>`;
    }
    html += `<h4 style="color:${c.color};margin:10px 0 6px;font-size:.9rem;text-align:center"><i class="${c.icon}"></i> ${c.label}</h4>`;
    html += `<table><thead><tr><th>البيان</th><th>المبلغ</th></tr></thead><tbody>`;
    FIELDS.forEach(f => {
        const v = d[f.key] || 0;
        const clr = getTypeColor(f.type);
        html += `<tr><td>${f.label}</td><td style="color:${clr};font-weight:700">${fmtNum(v)}</td></tr>`;
    });
    html += `<tr style="background:var(--surface2)"><td>إجمالي الخصومات</td><td style="color:var(--clr-expense);font-weight:700">${fmtNum(deductions)}</td></tr>`;
    html += `<tr style="background:var(--surface2)"><td>المتوقع</td><td style="font-weight:700">${fmtNum(expected)}</td></tr>`;
    if(diff !== 0){
        html += `<tr style="background:#fef3c7"><td>الفرق</td><td style="color:${diff>0?'var(--clr-income)':'var(--clr-expense)'};font-weight:700">${fmtNum(diff)}</td></tr>`;
    }
    html += `<tr class="total-row"><td>الصافي (المبلغ المستلم)</td><td style="color:${net>=0?'var(--clr-income)':'var(--clr-expense)'}">${fmtNum(net)}</td></tr>`;
    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function getTypeColor(type){
    const map = {income:'#16a34a',expense:'#dc2626',debt:'#ef4444',withdraw:'#d97706',deduct:'#7c3aed'};
    return map[type] || 'var(--text)';
}

function saveCurrentStep(){
    const info = getStepInfo(wizStep);
    if(info.type === 'manager'){
        const inp = $('#wizInput');
        if(inp) wizData.manager = inp.value.trim();
        return;
    }
    if(info.type === 'summary') return;
    const {field} = info;
    const inp = $('#wizInput');
    if(inp) wizData.fields[field.key] = parseK(inp.value);
}

/* ========= Save Closing ========= */
function saveClosing(){
    const c = selectedCashier;
    const d = wizData.fields;
    const net = d.network || 0;

    const closingRecord = {
        id: uid(),
        cashierKey: c.key,
        cashierLabel: c.label,
        date: today(),
        manager: wizData.manager || '',
        data: {...d},
        debtsList: wizData.debtsList || [],
        withdrawList: wizData.withdrawList || [],
        expensesList: wizData.expensesList || [],
        net: net,
        timestamp: Date.now(),
        synced: false
    };

    // === SAFE SAVE: Load, verify array, push, save, verify write ===
    let closings = loadLocal(STORE_KEY);
    if(!Array.isArray(closings)) closings = [];

    // Prevent duplicate: if same id already saved, skip
    if(!closings.find(x => x.id === closingRecord.id)){
        closings.push(closingRecord);
        saveLocal(STORE_KEY, closings);

        // Verify the write actually worked
        const verify = loadLocal(STORE_KEY);
        if(!verify.find(x => x.id === closingRecord.id)){
            // Try one more time
            verify.push(closingRecord);
            saveLocal(STORE_KEY, verify);
            console.warn('Write verification failed once - retried');
        }
    }

    // Add to pending queue (avoid duplicates)
    let pending = loadLocal(PENDING_KEY);
    if(!Array.isArray(pending)) pending = [];
    if(!pending.includes(closingRecord.id)){
        pending.push(closingRecord.id);
        saveLocal(PENDING_KEY, pending);
    }

    // Close wizard
    $('#wizardOverlay').classList.add('hidden');
    document.body.classList.remove('wizard-open');

    const totalSaved = loadLocal(STORE_KEY).filter(x => x.cashierKey === c.key).length;
    toast('✅ تم حفظ التقفيلة - الإجمالي: ' + totalSaved);
    renderClosings();

    // Try to sync immediately
    syncSingleClosing(closingRecord);
}

/* ========= Firebase Sync ========= */
function syncSingleClosing(record){
    if(!isOnline) {
        updatePendingBanner();
        return;
    }

    const badge = $('#syncStatus');
    badge.className = 'sync-badge syncing';
    badge.innerHTML = '<i class="ri-loader-4-line"></i>';

    const firebaseData = {
        id: record.id,
        cashierKey: record.cashierKey,
        cashierLabel: record.cashierLabel,
        date: record.date,
        manager: record.manager,
        data: record.data,
        debtsList: record.debtsList || [],
        withdrawList: record.withdrawList || [],
        expensesList: record.expensesList || [],
        net: record.net,
        timestamp: record.timestamp,
        source: 'cashier-app'
    };

    db.ref('closings/' + record.id).set(firebaseData)
        .then(() => {
            // Mark as synced locally
            markSynced(record.id);
            removePending(record.id);
            updateSyncUI();
            renderClosings();
            toast('تم المزامنة مع السيرفر');
        })
        .catch(err => {
            console.error('Sync failed:', err);
            updateSyncUI();
        });
}

function syncPending(){
    if(!isOnline) return toast('لا يوجد اتصال بالإنترنت');

    const pending = loadLocal(PENDING_KEY);
    if(!pending.length) return toast('لا توجد تقفيلات بانتظار المزامنة');

    const closings = loadLocal(STORE_KEY);
    const badge = $('#syncStatus');
    badge.className = 'sync-badge syncing';
    badge.innerHTML = '<i class="ri-loader-4-line"></i>';

    let synced = 0;
    const total = pending.length;

    pending.forEach(id => {
        const record = closings.find(c => c.id === id);
        if(!record) { removePending(id); synced++; return; }

        const firebaseData = {
            id: record.id,
            cashierKey: record.cashierKey,
            cashierLabel: record.cashierLabel,
            date: record.date,
            manager: record.manager,
            data: record.data,
            debtsList: record.debtsList || [],
            withdrawList: record.withdrawList || [],
            expensesList: record.expensesList || [],
            net: record.net,
            timestamp: record.timestamp,
            source: 'cashier-app'
        };

        db.ref('closings/' + record.id).set(firebaseData)
            .then(() => {
                markSynced(record.id);
                removePending(record.id);
                synced++;
                if(synced >= total){
                    updateSyncUI();
                    renderClosings();
                    toast('تم مزامنة جميع التقفيلات');
                }
            })
            .catch(err => {
                console.error('Sync failed for', id, err);
                synced++;
                if(synced >= total){ updateSyncUI(); }
            });
    });
}

function markSynced(id){
    const closings = loadLocal(STORE_KEY);
    const idx = closings.findIndex(c => c.id === id);
    if(idx >= 0){
        closings[idx].synced = true;
        saveLocal(STORE_KEY, closings);
    }
}

function removePending(id){
    let pending = loadLocal(PENDING_KEY);
    pending = pending.filter(p => p !== id);
    saveLocal(PENDING_KEY, pending);
}

/* ========= CASHIER NOTIFICATION SYSTEM ========= */
const CASHIER_NOTIF_KEY='cashier_sub_notifications';

function loadCashierNotifs(){try{return JSON.parse(localStorage.getItem(CASHIER_NOTIF_KEY))||[];}catch(e){return[];}}
function saveCashierNotifs(notifs){localStorage.setItem(CASHIER_NOTIF_KEY,JSON.stringify(notifs));}

function startCashierNotifListener(){
    if(!db||!selectedCashier) return;
    db.ref('notifications').orderByChild('targetApp').equalTo('cashier').on('child_added',snap=>{
        const notif=snap.val();
        if(!notif) return;
        if(notif.targetCashierType&&notif.targetCashierType!==selectedCashier.key) return;
        const notifs=loadCashierNotifs();
        if(notifs.find(n=>n.id===notif.id)) return;
        notifs.unshift(notif);
        saveCashierNotifs(notifs);
        updateCashierNotifBadge();
        if(notif.type==='alert_shortage'){
            showAlertBanner(notif);
        }
    });
}

function updateCashierNotifBadge(){
    const notifs=loadCashierNotifs();
    const unread=notifs.filter(n=>!n.read).length;
    const badge=$('#cashierNotifBadge');
    if(badge){badge.textContent=unread;badge.style.display=unread>0?'':'none';}
}

function toggleCashierNotifPanel(){
    const panel=$('#cashierNotifPanel');
    if(!panel) return;
    if(panel.classList.contains('hidden')){
        renderCashierNotifPanel();
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

function renderCashierNotifPanel(){
    const notifs=loadCashierNotifs();
    const list=$('#cashierNotifList');
    if(!list) return;
    if(!notifs.length){
        list.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3)"><i class="ri-notification-off-line" style="font-size:2rem;display:block;margin-bottom:6px"></i>لا توجد إشعارات</div>';
        return;
    }
    list.innerHTML=notifs.slice(0,30).map(n=>{
        const timeAgo=cashierGetTimeAgo(n.timestamp);
        const readClass=n.read?'cnotif-read':'cnotif-unread';
        const typeLabels={shortage:'نقص',error:'خطأ',note:'ملاحظة'};
        const alertLabel=typeLabels[n.alertType]||'تنبيه';
        const statusHtml=n.status==='resolved'?
            '<span style="font-size:.72rem;background:rgba(34,197,94,.12);color:#16a34a;padding:1px 6px;border-radius:6px"><i class="ri-check-line"></i> تم الرد</span>':
            '<span style="font-size:.72rem;background:rgba(245,158,11,.12);color:#d97706;padding:1px 6px;border-radius:6px"><i class="ri-time-line"></i> بانتظار الرد</span>';
        return `<div class="cnotif-item ${readClass}" onclick="openCashierNotifDetail('${n.id}')">
            <div class="cnotif-icon"><i class="ri-${n.type==='alert_shortage'?'error-warning':'notification-3'}-line"></i></div>
            <div class="cnotif-content">
                <div style="font-size:.84rem;font-weight:700">${escapeHtmlCashier(n.title||alertLabel)}</div>
                <div style="font-size:.78rem;color:var(--text2);margin:2px 0">${escapeHtmlCashier(n.message||'')}</div>
                ${n.type==='alert_shortage'?statusHtml:''}
                <div style="font-size:.7rem;color:var(--text3)">${n.senderUser?' من: '+escapeHtmlCashier(n.senderUser)+' | ':''} ${timeAgo}</div>
            </div>
        </div>`;
    }).join('');
}

function escapeHtmlCashier(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function showAlertBanner(notif){
    let banner=$('#alertBanner');
    if(!banner){
        banner=document.createElement('div');
        banner.id='alertBanner';
        banner.className='alert-banner';
        document.body.appendChild(banner);
    }
    const typeLabels={shortage:'نقص في التقفيلة',error:'خطأ في البيانات',note:'ملاحظة'};
    banner.innerHTML=`<div class="alert-banner-content">
        <i class="ri-error-warning-fill" style="font-size:1.2rem"></i>
        <div style="flex:1"><strong>${typeLabels[notif.alertType]||'تنبيه'}</strong><br><span style="font-size:.8rem">${escapeHtmlCashier(notif.message||'')}</span></div>
        <button class="btn btn-sm" onclick="openCashierNotifDetail('${notif.id}')" style="background:rgba(255,255,255,.2);color:#fff;border:none"><i class="ri-eye-line"></i> عرض</button>
        <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer"><i class="ri-close-line"></i></button>
    </div>`;
    banner.style.display='block';
    setTimeout(()=>{if(banner.parentElement)banner.remove();},15000);
}

function openCashierNotifDetail(id){
    const notifs=loadCashierNotifs();
    const notif=notifs.find(n=>n.id===id);
    if(!notif) return;
    notif.read=true;
    saveCashierNotifs(notifs);
    updateCashierNotifBadge();
    const panel=$('#cashierNotifPanel');
    if(panel&&!panel.classList.contains('hidden')) panel.classList.add('hidden');

    const typeLabels={shortage:'نقص في التقفيلة',error:'خطأ في البيانات',note:'ملاحظة عامة'};
    let html=`<div style="text-align:center;margin-bottom:12px">
        <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin:0 auto 8px"><i class="ri-error-warning-fill"></i></div>
        <div style="font-weight:700;font-size:1rem;color:var(--danger)">${typeLabels[notif.alertType]||'تنبيه'}</div>
        <div style="font-size:.82rem;color:var(--text2);margin-top:4px">من: ${escapeHtmlCashier(notif.senderUser||'المسؤول')}</div>
        <div style="font-size:.78rem;color:var(--text3)">${notif.closingDate||''} - ${notif.cashierLabel||''}</div>
    </div>
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;font-size:.88rem;line-height:1.6">${escapeHtmlCashier(notif.message||'')}</div>`;

    if(notif.status==='pending'){
        html+=`<div class="field"><label>ردك / ملاحظتك</label><textarea id="alertResponse" class="input-field" rows="3" placeholder="اكتب ردك هنا..."></textarea></div>
        <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-success" onclick="respondToAlert('${notif.id}','resolved')" style="flex:1"><i class="ri-check-line"></i> تم إتمام النقص</button>
            <button class="btn btn-primary" onclick="respondToAlert('${notif.id}','noted')" style="flex:1"><i class="ri-chat-3-line"></i> إرسال رد</button>
        </div>`;
    } else {
        html+=`<div style="text-align:center;color:#16a34a;font-weight:700;font-size:.9rem"><i class="ri-check-double-line"></i> تم الرد على هذا التنبيه</div>`;
        if(notif.responseMessage) html+=`<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:8px 12px;margin-top:8px;font-size:.85rem">${escapeHtmlCashier(notif.responseMessage)}</div>`;
    }

    // Show in a modal overlay
    let overlay=$('#alertDetailOverlay');
    if(!overlay){
        overlay=document.createElement('div');
        overlay.id='alertDetailOverlay';
        overlay.className='alert-detail-overlay';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML=`<div class="alert-detail-card">
        <button class="wiz-close" onclick="$('#alertDetailOverlay').classList.add('hidden')"><i class="ri-close-line"></i></button>
        ${html}
    </div>`;
    overlay.classList.remove('hidden');
}

function respondToAlert(notifId,status){
    const responseMsg=$('#alertResponse')?.value?.trim()||'';
    if(!responseMsg) return toast('اكتب ردك أولاً');
    const session=getAuthSession();
    const senderName=session?session.username:'كاشير';

    // Update notification status in Firebase
    db.ref('notifications/'+notifId).update({
        status:status==='resolved'?'resolved':'noted',
        responseMessage:responseMsg,
        respondedBy:senderName,
        respondedAt:Date.now()
    }).then(()=>{
        // Create response notification for main app
        const respNotifId=uid();
        db.ref('notifications/'+respNotifId).set({
            id:respNotifId,
            type:'alert_response',
            title:status==='resolved'?'تم إتمام النقص':'رد على التنبيه',
            message:responseMsg,
            originalNotifId:notifId,
            timestamp:Date.now(),
            targetApp:'main',
            read:false,
            senderUser:senderName
        });

        // Update local notif
        const notifs=loadCashierNotifs();
        const notif=notifs.find(n=>n.id===notifId);
        if(notif){
            notif.status=status==='resolved'?'resolved':'noted';
            notif.responseMessage=responseMsg;
            saveCashierNotifs(notifs);
        }

        toast('تم إرسال الرد بنجاح');
        const overlay=$('#alertDetailOverlay');
        if(overlay) overlay.classList.add('hidden');
        renderCashierNotifPanel();
    }).catch(e=>{
        toast('فشل إرسال الرد');
        console.error(e);
    });
}

function markAllCashierNotifsRead(){
    const notifs=loadCashierNotifs();
    notifs.forEach(n=>n.read=true);
    saveCashierNotifs(notifs);
    updateCashierNotifBadge();
    renderCashierNotifPanel();
}

function cashierGetTimeAgo(ts){
    if(!ts) return '';
    const diff=Date.now()-ts;
    const mins=Math.floor(diff/60000);
    if(mins<1) return 'الآن';
    if(mins<60) return mins+' دقيقة';
    const hrs=Math.floor(mins/60);
    if(hrs<24) return hrs+' ساعة';
    const days=Math.floor(hrs/24);
    if(days<30) return days+' يوم';
    return Math.floor(days/30)+' شهر';
}

/* ========= PWA Install Prompt ========= */
let deferredPrompt = null;
const INSTALL_DISMISSED_KEY = 'cashier_install_dismissed';

function isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode(){
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function showInstallPrompt(){
    if(isInStandaloneMode()) return; // already installed
    const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
    // Show again after 3 days if dismissed
    if(dismissed && (Date.now() - parseInt(dismissed)) < 3*24*60*60*1000) return;

    if(isIOS()){
        setTimeout(()=>{ $('#iosInstallGuide').classList.remove('hidden'); }, 1500);
    } else if(deferredPrompt){
        setTimeout(()=>{ $('#installPrompt').classList.remove('hidden'); }, 1500);
    }
}

function dismissInstall(){
    localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
    $('#installPrompt').classList.add('hidden');
    // Show FAB
    showInstallFab();
}

function showInstallFab(){
    if(!deferredPrompt || isInStandaloneMode()) return;
    let fab = $('#installFab');
    if(!fab){
        fab = document.createElement('button');
        fab.id = 'installFab';
        fab.className = 'install-fab';
        fab.innerHTML = '<i class="ri-download-2-line"></i> تثبيت التطبيق';
        fab.onclick = triggerInstall;
        document.body.appendChild(fab);
    }
    fab.classList.remove('hidden');
}

async function triggerInstall(){
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#installPrompt').classList.add('hidden');
    const fab = $('#installFab');
    if(fab) fab.classList.add('hidden');
    if(outcome === 'accepted'){
        toast('✅ تم تثبيت التطبيق بنجاح!');
        localStorage.removeItem(INSTALL_DISMISSED_KEY);
    }
}

// Capture beforeinstallprompt
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallPrompt();
});

// App installed
window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    toast('✅ تم تثبيت التطبيق على جهازك');
    const fab = $('#installFab');
    if(fab) fab.classList.add('hidden');
    $('#installPrompt').classList.add('hidden');
    localStorage.removeItem(INSTALL_DISMISSED_KEY);
});

/* ========= Back Button Navigation (Android + Browser) ========= */
// حالات التنقل: login → home → wizard → wizard-steps
function pushNavState(page, extra={}){
    history.pushState({page, ...extra}, '', '');
}

function handlePopState(e){
    const state = e.state;

    // 1. نافذة iOS أو Install مفتوحة؟ أغلقها أولاً
    if(!$('#iosInstallGuide').classList.contains('hidden')){
        $('#iosInstallGuide').classList.add('hidden');
        history.pushState({page:'home'}, '', '');
        return;
    }
    if(!$('#installPrompt').classList.contains('hidden')){
        $('#installPrompt').classList.add('hidden');
        history.pushState({page:'home'}, '', '');
        return;
    }

    // 2. الويزارد مفتوح
    if(!$('#wizardOverlay').classList.contains('hidden')){
        if(wizStep > 0){
            // ارجع خطوة للخلف داخل الويزارد
            wizPrev();
            // أعد push الحالة لأن popstate يحذفها
            history.pushState({page:'wizard', step: wizStep}, '', '');
        } else {
            // الخطوة الأولى: أغلق الويزارد وارجع للرئيسية
            closeWizard();
            history.pushState({page:'home'}, '', '');
        }
        return;
    }

    // 3. الصفحة الرئيسية - اعرض تأكيد الخروج
    if(!$('#app').classList.contains('hidden')){
        showExitConfirm();
        // أعد push الحالة حتى لا يخرج المستخدم
        history.pushState({page:'home'}, '', '');
        return;
    }

    // 4. إذا رجع إلى صفحة الـ login - لا تفعل شيء
    if(!$('#loginOverlay').classList.contains('hidden')){
        history.pushState({page:'login'}, '', '');
        return;
    }
}

/* ===== Exit Confirm Dialog ===== */
function showExitConfirm(){
    // إزالة أي dialog سابق
    const old = $('#exitConfirmDialog');
    if(old) old.remove();

    const dialog = document.createElement('div');
    dialog.id = 'exitConfirmDialog';
    dialog.innerHTML = `
        <div class="exit-overlay" onclick="closeExitConfirm()"></div>
        <div class="exit-card">
            <div class="exit-icon"><i class="ri-logout-box-r-line"></i></div>
            <h3>تسجيل الخروج</h3>
            <p>هل تريد تسجيل الخروج من التطبيق؟</p>
            <div class="exit-actions">
                <button class="btn btn-danger" onclick="closeExitConfirm();logoutCashier()">
                    <i class="ri-logout-box-r-line"></i> تسجيل الخروج
                </button>
                <button class="btn btn-ghost" onclick="closeExitConfirm()">
                    <i class="ri-close-line"></i> إلغاء
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
}

function closeExitConfirm(){
    const d = $('#exitConfirmDialog');
    if(d) d.remove();
}

window.addEventListener('popstate', handlePopState);


document.addEventListener('DOMContentLoaded', () => {
    /* login events */
    $('#loginBtn').addEventListener('click',doLogin);
    $('#loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
    $('#loginUser').addEventListener('keydown',e=>{if(e.key==='Enter')$('#loginPass').focus();});

    /* check online status for login */
    if(!navigator.onLine){
        const offEl=$('#loginOffline');if(offEl)offEl.style.display='block';
    }
    window.addEventListener('online',()=>{const offEl=$('#loginOffline');if(offEl)offEl.style.display='none';});
    window.addEventListener('offline',()=>{const offEl=$('#loginOffline');if(offEl)offEl.style.display='block';});

    /* check existing session */
    const session = getAuthSession();
    if(session && session.cashierType && CASHIERS[session.cashierType]){
        $('#loginOverlay').classList.add('hidden');
        pushNavState('home');
        autoSelectCashier(session.cashierType);
    } else {
        // صفحة اللوغن هي الحالة الأساسية
        history.replaceState({page:'login'}, '', '');
    }

    // Register service worker
    if('serviceWorker' in navigator){
        navigator.serviceWorker.register('sw.js');
    }

    /* notification panel close on outside click */
    document.addEventListener('click',e=>{
        const panel=$('#cashierNotifPanel');const toggle=$('#cashierNotifToggle');
        if(panel&&!panel.classList.contains('hidden')&&!panel.contains(e.target)&&toggle&&!toggle.contains(e.target))panel.classList.add('hidden');
    });

    /* PWA install buttons */
    const installBtn = $('#installBtn');
    if(installBtn) installBtn.addEventListener('click', triggerInstall);

    const installLaterBtn = $('#installLaterBtn');
    if(installLaterBtn) installLaterBtn.addEventListener('click', dismissInstall);

    const iosGuideClose = $('#iosGuideClose');
    if(iosGuideClose) iosGuideClose.addEventListener('click', ()=>{
        $('#iosInstallGuide').classList.add('hidden');
        localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
    });

    // On iOS: show guide if not installed
    if(isIOS() && !isInStandaloneMode()){
        const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
        if(!dismissed || (Date.now() - parseInt(dismissed)) > 3*24*60*60*1000){
            setTimeout(()=>{ $('#iosInstallGuide').classList.remove('hidden'); }, 2000);
        }
    }
});