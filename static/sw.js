// Service worker do PWA: existe para o app ir para a tela de início (e, depois, receber o aviso no celular).
// Não guarda nada: sem cache e sem modo offline. Páginas, /entrar, /oauth/* e /api/* vão sempre direto à rede,
// e os estáticos seguem o cache HTTP de sempre (com o ?v= de cada página). Sem handler de fetch, de propósito.
"use strict";

self.addEventListener("install", () => self.skipWaiting());   // versão nova entra sem esperar fechar as abas
self.addEventListener("activate", ev => ev.waitUntil(self.clients.claim()));
