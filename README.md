# Pontaj Fabrică - ERGIO

Aplicație desktop pentru pontaj fabrică.

## Arhitectură Client-Server

Această versiune a aplicației folosește o arhitectură client-server pentru a permite mai multor clienți să acceseze și să modifice datele în timp real.

### Server

Serverul este o aplicație Node.js care folosește `express` pentru a expune un API și `websql` pentru a gestiona baza de date.

**Setup Server:**

1.  **Navigați în directorul `src`:**
    ```bash
    cd src
    ```
2.  **Instalați dependințele serverului:**
    ```bash
    npm install
    ```
3.  **Porniți serverul:**
    ```bash
    node server.js
    ```
    Serverul va porni pe `http://localhost:9000`.

### Client (Aplicația Electron)

Clientul este o aplicație Electron care se conectează la server pentru a efectua operațiuni pe baza de date.

**Configurare Client:**

1.  **Asigurați-vă că serverul rulează.**
2.  **Modificați URL-ul serverului în `src/main.js`:**
    -   Găsiți constanta `dbUrl` și înlocuiți valoarea cu adresa IP și portul serverului dumneavoastră.
        ```javascript
        const dbUrl = 'http://10.129.67.66:9000/query';
        ```
3.  **Porniți aplicația Electron:**
    ```bash
    npm start
    ```

## Backup și Restore

Funcționalitatea de backup și restore a fost eliminată din aplicația client, deoarece baza de date este acum gestionată de server. Pentru a face backup la baza de date, copiați fișierul `pontaj.db` din directorul în care rulează serverul. Pentru a restaura, înlocuiți fișierul `pontaj.db` cu o versiune anterioară. Asigurați-vă că serverul este oprit înainte de a efectua operațiuni de restaurare.
