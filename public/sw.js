self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title, {body:data.body,tag:data.tag,data:{url:data.url},dir:"rtl",lang:"ar"}),
    self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients => clients.forEach(client => client.postMessage({type:"siteflow-update"})))
  ]));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(target.href));
});
