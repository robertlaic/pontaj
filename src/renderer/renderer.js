// /src/renderer/renderer.js

document.addEventListener('DOMContentLoaded', () => {
    // This is a placeholder for future frontend logic.
    // The main logic for handling WebSocket events will be added here.
    console.log("Renderer script loaded.");

    // Example: Display a notification bar
    function showUpdateNotification() {
        let notificationBar = document.getElementById('notification-bar');
        if (!notificationBar) {
            notificationBar = document.createElement('div');
            notificationBar.id = 'notification-bar';
            notificationBar.style.position = 'fixed';
            notificationBar.style.bottom = '0';
            notificationBar.style.left = '0';
            notificationBar.style.width = '100%';
            notificationBar.style.backgroundColor = '#28a745';
            notificationBar.style.color = 'white';
            notificationBar.style.padding = '10px';
            notificationBar.style.textAlign = 'center';
            notificationBar.style.zIndex = '1000';
            notificationBar.style.transition = 'opacity 0.5s';
            notificationBar.innerHTML = `Datele au fost actualizate. <button id="refresh-button" style="margin-left: 15px; padding: 5px 10px;">Reîmprospătare</button>`;
            document.body.appendChild(notificationBar);

            document.getElementById('refresh-button').addEventListener('click', () => {
                window.location.reload();
            });
        }
        notificationBar.style.opacity = '1';
    }

    // Connect to the WebSocket server
    // The preload script will expose the socket functionality
    if (window.electronAPI && window.electronAPI.onDatabaseChange) {
        window.electronAPI.onDatabaseChange((event, data) => {
            console.log('Database change received from main process:', data);
            showUpdateNotification();
        });
    }
});
