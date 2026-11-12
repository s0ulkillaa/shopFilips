// Funzioni condivise da registrazione.html e login.html
// Gli utenti sono salvati nel localStorage del browser: va bene per un sito statico
// di prova, non sostituisce un'autenticazione lato server.

const CHIAVE_UTENTI = 'utenti';
const CHIAVE_SESSIONE = 'utenteCorrente';

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

function mostraMessaggio(elemento, testo, tipo) {
    elemento.textContent = testo;
    elemento.className = 'mt-3 text-center text-' + (tipo === 'ok' ? 'success' : 'danger');
}

const PAGINA_LOGIN = 'pagina_login.html';
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
function richiediLogin() {
    paginaRiservata = true;
    if (!utenteCorrente()) {
        document.documentElement.style.visibility = 'hidden';
        window.location.replace(PAGINA_LOGIN);
    }
}

function esci() {
    localStorage.removeItem(CHIAVE_SESSIONE);
}

// Con il tasto "indietro" dopo l'uscita il browser può mostrare la pagina dalla cache: ricontrolla
window.addEventListener('pageshow', function (e) {
    if (e.persisted && paginaRiservata) richiediLogin();
});
