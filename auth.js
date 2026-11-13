// Funzioni condivise da registrazione.html e login.html.
// Le operazioni di autenticazione sono ora gestite dal backend con PostgreSQL.

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
