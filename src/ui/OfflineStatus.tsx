import { useEffect, useRef, useState } from 'react';

export function OfflineStatus({ protectedSession }: { protectedSession: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker>();
  const accepted = useRef(false);
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    addEventListener('online', network); addEventListener('offline', network);
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return () => { removeEventListener('online', network); removeEventListener('offline', network); };
    let disposed = false;
    let watchedRegistration: ServiceWorkerRegistration | undefined;
    let watchedWorker: ServiceWorker | null | undefined;
    const check = () => { if (!disposed && watchedRegistration) setWaiting(watchedRegistration.waiting || undefined); };
    const watch = () => {
      watchedWorker?.removeEventListener('statechange', check);
      watchedWorker = watchedRegistration?.installing;
      watchedWorker?.addEventListener('statechange', check);
    };
    const changed = () => { if (accepted.current) location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' }).then(async registration => {
      if (disposed) return;
      watchedRegistration = registration;
      check();
      watch(); registration.addEventListener('updatefound', watch);
      await navigator.serviceWorker.ready;
      if (!disposed) setSaved(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; watchedWorker?.removeEventListener('statechange', check); watchedRegistration?.removeEventListener('updatefound', watch); removeEventListener('online', network); removeEventListener('offline', network); navigator.serviceWorker.removeEventListener('controllerchange', changed); };
  }, []);
  return <div className="offline-status" role="status"><span>{online ? 'Online' : 'Offline'}{saved ? ' · Offline files saved' : failed ? ' · Offline files could not be saved' : ''}</span>{waiting && <button className="secondary-button" disabled={protectedSession} onClick={() => { accepted.current = true; waiting.postMessage({ type: 'ACTIVATE' }); }}>{protectedSession ? 'Update ready · finish your saved challenge first' : 'Apply available update'}</button>}</div>;
}
