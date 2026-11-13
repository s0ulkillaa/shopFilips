// Funzioni condivise da registrazione.html e login.html
// Gli utenti sono salvati nel localStorage del browser e copiati nel file credenziali.txt
// (API File System Access: funziona solo su Chrome/Edge). Va bene per un sito statico
// di prova, non sostituisce un'autenticazione lato server.

const CHIAVE_UTENTI = 'utenti';
const CHIAVE_SESSIONE = 'utenteCorrente';
const NOME_FILE_CREDENZIALI = 'credenziali.txt';

function leggiUtenti() {
    try {
        return JSON.parse(localStorage.getItem(CHIAVE_UTENTI)) || [];
    } catch (e) {
        return [];
    }
}

function salvaUtenti(utenti) {
    localStorage.setItem(CHIAVE_UTENTI, JSON.stringify(utenti));
}

function aHex(buffer) {
    return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
}

function generaSalt() {
    return aHex(crypto.getRandomValues(new Uint8Array(16)));
}

// La password non viene mai salvata: si salva solo l'hash PBKDF2 con un salt casuale
async function calcolaHash(password, salt) {
    const enc = new TextEncoder();
    const chiave = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bit = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
        chiave,
        256
    );
    return aHex(bit);
}

// ---------------------------------------------------------------------------
// File credenziali.txt
// Contiene l'elenco degli utenti in JSON (nome, cognome, email, salt, hash PBKDF2):
// le password non ci sono. Il file è sempre lo stesso e viene sovrascritto, e gli
// utenti già presenti non vengono mai tolti (nemmeno se spariscono dal localStorage).
// Il browser ricorda quale file è stato scelto (IndexedDB) e chiede il permesso
// di usarlo una volta per sessione.
// ---------------------------------------------------------------------------
const DB_NOME = 'shopFilips';
const DB_STORE = 'impostazioni';
const CHIAVE_FILE = 'fileCredenziali';
const OPZIONI_FILE = { types: [{ description: 'File di testo', accept: { 'text/plain': ['.txt'] } }] };

function fileSupportato() {
    return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window && 'indexedDB' in window;
}

function apriDb() {
    return new Promise(function (resolve, reject) {
        const richiesta = indexedDB.open(DB_NOME, 1);
        richiesta.onupgradeneeded = function () { richiesta.result.createObjectStore(DB_STORE); };
        richiesta.onsuccess = function () { resolve(richiesta.result); };
        richiesta.onerror = function () { reject(richiesta.error); };
    });
}

async function dbLeggi(chiave) {
    const db = await apriDb();
    return new Promise(function (resolve, reject) {
        const r = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(chiave);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
    });
}

async function dbScrivi(chiave, valore) {
    const db = await apriDb();
    return new Promise(function (resolve, reject) {
        const t = db.transaction(DB_STORE, 'readwrite');
        t.objectStore(DB_STORE).put(valore, chiave);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
    });
}

async function dbElimina(chiave) {
    const db = await apriDb();
    return new Promise(function (resolve, reject) {
        const t = db.transaction(DB_STORE, 'readwrite');
        t.objectStore(DB_STORE).delete(chiave);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
    });
}

// Dimentica il file collegato: alla prossima registrazione verrà chiesto di sceglierlo di nuovo
async function scollegaFile() {
    try { await dbElimina(CHIAVE_FILE); } catch (e) { /* niente da fare */ }
}

// Il permesso si può chiedere solo in risposta a un click dell'utente
async function haPermesso(handle, scrittura) {
    const opzioni = { mode: scrittura ? 'readwrite' : 'read' };
    try {
        if ((await handle.queryPermission(opzioni)) === 'granted') return true;
        return (await handle.requestPermission(opzioni)) === 'granted';
    } catch (e) {
        return false;
    }
}

// Restituisce il file collegato (chiedendo il permesso se serve), oppure null.
// Con crea = true, la prima volta apre "Salva con nome" per creare o scegliere credenziali.txt.
async function ottieniFile(crea, scrittura) {
    if (!fileSupportato()) return null;
    try {
        const salvato = await dbLeggi(CHIAVE_FILE);
        if (salvato) {
            return (await haPermesso(salvato, scrittura)) ? salvato : null;
        }
        if (!crea) return null;
        const handle = await window.showSaveFilePicker(
            Object.assign({ suggestedName: NOME_FILE_CREDENZIALI }, OPZIONI_FILE)
        );
        await dbScrivi(CHIAVE_FILE, handle);
        return handle;
    } catch (e) {
        return null; // finestra chiusa dall'utente o API non disponibile
    }
}

// Per scegliere un credenziali.txt già esistente (ad esempio dopo aver svuotato i dati del sito)
async function collegaFileEsistente() {
    if (!fileSupportato()) return null;
    try {
        const scelti = await window.showOpenFilePicker(Object.assign({ multiple: false }, OPZIONI_FILE));
        await dbScrivi(CHIAVE_FILE, scelti[0]);
        return scelti[0];
    } catch (e) {
        return null;
    }
}

// Se il contenuto non è un elenco di utenti valido lancia Error('FILE_NON_VALIDO'),
// così il file non viene mai sovrascritto per sbaglio.
async function leggiDaFile(handle) {
    const file = await handle.getFile();
    const testo = (await file.text()).trim();
    if (!testo) return [];
    let dati;
    try {
        dati = JSON.parse(testo);
    } catch (e) {
        throw new Error('FILE_NON_VALIDO');
    }
    const valido = Array.isArray(dati) && dati.every(u => u && u.email && u.salt && u.hash);
    if (!valido) throw new Error('FILE_NON_VALIDO');
    return dati;
}

async function scriviSuFile(handle, utenti) {
    const scrittura = await handle.createWritable();
    await scrittura.write(JSON.stringify(utenti, null, 2) + '\n');
    await scrittura.close();
}

// Unione per email: se un utente è in entrambi vale quello del file
function unisciUtenti(daFile, locali) {
    const risultato = daFile.slice();
    const email = new Set(daFile.map(u => u.email));
    locali.forEach(function (u) {
        if (!email.has(u.email)) risultato.push(u);
    });
    return risultato;
}

// Allinea localStorage e file: gli utenti del file tornano nel browser, e (con scrivi = true)
// quelli presenti solo nel browser vengono aggiunti al file.
async function sincronizzaConFile(handle, scrivi) {
    const daFile = await leggiDaFile(handle);
    const uniti = unisciUtenti(daFile, leggiUtenti());
    salvaUtenti(uniti);
    if (scrivi && uniti.length !== daFile.length) {
        await scriviSuFile(handle, uniti);
    }
    return uniti;
}

function mostraMessaggio(elemento, testo, tipo) {
    elemento.textContent = testo;
    elemento.className = 'mt-3 text-center text-' + (tipo === 'ok' ? 'success' : 'danger');
}

const PAGINA_LOGIN = 'login.html';
const PAGINA_HOME = 'index.html';
let paginaRiservata = false;

function utenteCorrente() {
    try {
        return JSON.parse(localStorage.getItem(CHIAVE_SESSIONE));
    } catch (e) {
        return null;
    }
}

// Da chiamare nell'<head> delle pagine riservate: senza login rimanda alla pagina di login.
// Il controllo è solo lato browser: protegge la navigazione, non i dati.
function richiediLogin(paginaRitorno) {
    paginaRiservata = true;
    if (!utenteCorrente()) {
        document.documentElement.style.visibility = 'hidden';
        const pagina = paginaRitorno || window.location.pathname.split('/').pop();
        window.location.replace(PAGINA_LOGIN + '?redirect=' + encodeURIComponent(pagina));
    }
}

function esci() {
    localStorage.removeItem(CHIAVE_SESSIONE);
}

// Con il tasto "indietro" dopo l'uscita il browser può mostrare la pagina dalla cache: ricontrolla
window.addEventListener('pageshow', function (e) {
    if (e.persisted && paginaRiservata) richiediLogin();
});
