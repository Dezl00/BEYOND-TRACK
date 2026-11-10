export const notificationOrigin = "https://beyond-track.online";
const requestIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export const requestLink = (id: string) =>
  notificationOrigin + "/requests/" + encodeURIComponent(id);

export function requestAfterLogin(id: string | null) {
  return id && requestIdPattern.test(id) ? "/requests/" + id : null;
}

export function loginPath(path: string | null) {
  const id = path?.split("/")[2];
  return id && requestAfterLogin(id) === path
    ? "/login?request=" + id
    : "/login";
}
