
const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let janela;
let servidor;
let iniciouServidor = false;

function abrirPainel() {
  janela = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Bad_Dos_Trenzinhos - Administração',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  janela.loadURL('http://127.0.0.1:3000/admin.html');

  janela.webContents.on('did-fail-load', async () => {
    if (!janela || janela.isDestroyed()) return;

    const escolha = await dialog.showMessageBox(janela, {
      type: 'error',
      title: 'Erro ao abrir o painel',
      message: 'Não foi possível conectar ao servidor.',
      detail: 'Confira se o servidor está funcionando e se a porta 3000 está livre.',
      buttons: ['Fechar aplicativo']
    });

    if (escolha.response === 0) app.quit();
  });

  janela.on('closed', () => {
    janela = null;
  });
}

app.whenReady().then(() => {
  const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
  const serverPath = path.join(__dirname, 'server.js');

  if (!fs.existsSync(nodePath) || !fs.existsSync(serverPath)) {
    dialog.showErrorBox(
      'Erro de inicialização',
      'Não encontrei o Node.js ou o arquivo server.js.'
    );
    app.quit();
    return;
  }

  servidor = spawn(nodePath, [serverPath], {
    cwd: __dirname,
    stdio: 'ignore',
    windowsHide: true
  });

  servidor.once('spawn', () => {
    iniciouServidor = true;
    setTimeout(abrirPainel, 2000);
  });

  servidor.on('error', (erro) => {
    dialog.showErrorBox('Erro ao iniciar o servidor', erro.message);
    app.quit();
  });

  servidor.on('exit', (codigo) => {
    if (iniciouServidor && !app.isQuitting) {
      dialog.showErrorBox(
        'Servidor encerrado',
        `O servidor foi encerrado (código ${codigo}).`
      );
    }
  });
});

app.isQuitting = false;

app.on('before-quit', () => {
  app.isQuitting = true;
  if (servidor) servidor.kill();
});

app.on('window-all-closed', () => {
  app.quit();
});
