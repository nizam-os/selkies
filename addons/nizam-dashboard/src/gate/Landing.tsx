/**
 * The locked page, disguised as a search engine's home page (the LMGTFY
 * components under `./lmgtfy`): what is typed in the search box is the
 * password, sent by Enter, either button, or the AI Mode pill.
 *
 * `main.jsx` renders it in place of the dashboard whenever the page has no
 * live session token, and never starts the streaming core under it. Nothing on
 * the page says what it guards: anything that is not the password is searched
 * on Google, as the page it imitates would, with `btnI` for I'm Feeling Lucky
 * and Google's AI Mode parameters for the pill. Only a definite "wrong" from
 * the gate does that. An attempt the gate refuses or cannot take (throttled,
 * unavailable, unreachable) was never checked and might be the password, so
 * it stays in the box, which only the owner reads as "not now". The page's
 * links are google.com's own, and nothing leaves with a referrer, so Google
 * never learns the desktop's address.
 *
 * A login keeps this page behind the desktop in the history, so Back returns
 * here and locks the session (`gate.ts`); when the back/forward cache restores
 * the page whole, that lock happens here, and the box, which still held the
 * password, is emptied, as it is once a login succeeds.
 *
 * The tab carries google.com's title and favicon instead of the core's
 * "Selkies", which the core's module sets as it loads and again once it has
 * read `manifest.json`, so the title is held for as long as the page lives.
 * The page's strings are part of the disguise and stay English. The root
 * carries `allow-native-input` so the core's input handler, which loads with
 * the page, leaves typing alone.
 * @module
 */
import React, { useEffect, useRef, useState } from "react";
import { dropHeldSession, login } from "./gate";
import { HomePage, type SearchMode } from "./lmgtfy/home-page";
import { appsIcon, icons, logo } from "./lmgtfy/assets";
import "./lmgtfy/theme.css";

const TITLE = "Google";
const SEARCH_URL = "https://www.google.com/search";
/** What each control adds to the search URL, as google.com's own do. */
const SEARCH_PARAMS: Record<SearchMode, Record<string, string>> = {
  search: {},
  lucky: { btnI: "I'm Feeling Lucky" },
  ai: { udm: "50", aep: "22" },
};
/** google.com's favicon (a 32×32 PNG at gstatic's `searchlogo/ico/favicon.ico`), inlined so showing it asks Google for nothing. */
const FAVICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsSAAALEgHS3X78AAAE3ElEQVRYhc2XW2xUVRSGv30uU9rTMhUaCuVixQSMpLYmPIhYwAcTIyKFROI1KQmkxBgj8UEf5MEYiSYmPvhAfCASY02MUaFEHjSRQYtGNDAqIhKxQJVeodPLMJ2Zc/by4cz91tZ4+5Od2Wf2Xuv/z9lrr722EhFmiTagA9gEbCwz5wQQAg4D4Vl5FZGZWqeIhGXuCKdsK/qvNNgsIqG/QFyIUMrXnAR0iEjkbyBPI5LyWcSlpDgGOoG3S67XV71wshd+CMPwEAiAAShoXIy0tsL6dtS6u8qt+E7gUO4fhQI6gI+LzM6ehjf2w9AQJC1QgCi/KRMwQZmIYSLKRBYvwXj2KVTLmlIituEHaZGAZvzIDeZN/+BVOPwhTAX850QgS44CZWWaoBDTRgzbd77lfoxdTxYKGMffUZfA/35pHCoif+8F+Pxdvx/wSr1NPpSR/3z2HERvFM4KkrMMaYtOCvf2p8/A5W5ouAHz4+AkoDoJpguGB6QEpT6GAKJUVsstKzBe2QdOTSmpG1OcmSUIA62Z4eEeCD0BV+pgnoahOhhwwBCwVsL23bCuHZxaf340Cl9/g+5+H0YjcOvKSuRpfA+0KRFpA87kDX2xCgYHIWpDNOALmLLhju2w4/kscSGiUeTIMdTWzTORp3GnhR/5WYwdhUA/NBhQKzDtQZUHddvhkZcru3Mc1GMPz4Y4jQ4LP7dnETkK8wywACVgu2DUwQOvzcXxbLHJojD4pnuz/WoBF1j2KATyN0ga310p41pAkc0xCqEpqFhcr3JnbbSK7OJ9oAyUpcAEAsDSLWVfYXd3OQGFGVaxpx262vP/Ldi4KelCZk+LoWDeirICykKpbEs/l0CRABGd7aeMhNLGcxJTxk/xFxAN4uJpl6R4TIuLG79U0b+gEbxU06TSUqpVRlEMEGhGJy4zJRpLmVzXHtWRIzTUbSjpoOueNInK++35EQbGZ+THwi+jMjtB17bjXesDDKLaT7f9I+9Q37QPy6wvcrCnXeWQ+5ichu5v08IkM7725iLzEwZ+DZeB1G9lVAv9nseg1vziac7EJ/nk1z0zv04KB89EGXVjRO0pkkYCVyVJGgnWFsdyyCDnbAaw6zsYtldwUQtXtTCshUEx+HL0Mw5e2MuUO1mR/MBPf7A//DvjNcNMVI8QC0zhGR4PtZQM5MMlD6OJiRDHz91LRBTjYtAnDtd1DWPikAi0squ5i/sa1hO0nIynnoGLvHn+Ar0DMQKx5VhuNbZbg5MIYno2x3fXsTSYJyJzGEGJMizUt5fjVw8wLjaXJciEOEyKw5DXSJwASapI6lpqzflEkh6SDEJ8CYiJii3HdB0CroMdX0BXy0Je2lAUPzuBQ7kVUYiCtNx9oYuPhnoYkIV4YjGmb2JSGnBReFKFxsbVVSgE8Rz09BJQGuJNWLEmPMOlrXYZJ7fdXkh+gtQZlJsHOvHLpQweX/UWmxp3ABCXQHZAzEzXUG6mr6yJTN+1x3lw+SKObV5dSD6e4vJtZlOUnoqc5rmfX+e32AQxCSIYCCag0NryT01dhXjVSHIBtbKUF29bx9OrVxW6ggpFaRqdlCnLj42c4uhImN6x8/RPXwMUIgYKYb5Zz93BNrY0ruHBRS0E7apSLorK8v/8YvK/vZr9a5fTUjFQDv/I9fxPxUx0d1WRkbMAAAAASUVORK5CYII=";

/**
 * Gives the tab the disguise's title and icon and keeps the page's address
 * out of the searches it hands to Google.
 */
function useDisguise(): void {
  useEffect(() => {
    const holdTitle = () => {
      if (document.title !== TITLE) document.title = TITLE;
    };
    holdTitle();
    const titleWatch = new MutationObserver(holdTitle);
    titleWatch.observe(document.head, { subtree: true, childList: true, characterData: true });

    for (const link of document.querySelectorAll<HTMLLinkElement>("link[rel~=icon], link[rel=apple-touch-icon]")) {
      link.href = FAVICON;
    }

    const referrer = document.createElement("meta");
    referrer.name = "referrer";
    referrer.content = "no-referrer";
    document.head.append(referrer);

    return () => {
      titleWatch.disconnect();
      referrer.remove();
    };
  }, []);
}

/** The full-page locked view. */
export default function Landing(): React.ReactElement {
  const [query, setQuery] = useState("");
  const pending = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useDisguise();

  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      dropHeldSession();
      setQuery("");
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  const search = async (text: string, mode: SearchMode = "search") => {
    if (!text || pending.current) return;
    pending.current = true;
    try {
      if (await login(text)) {
        setQuery("");
      } else {
        const params = new URLSearchParams({ q: text, ...SEARCH_PARAMS[mode] });
        window.location.assign(`${SEARCH_URL}?${params}`);
      }
    } catch {
      // Refused or unreachable: the text stays, the only sign of it.
    } finally {
      pending.current = false;
      inputRef.current?.focus();
    }
  };

  return (
    <div className="lmgtfy allow-native-input h-dvh overflow-auto bg-background text-foreground">
      <HomePage
        logo={logo}
        icons={icons}
        appsIcon={appsIcon}
        query={query}
        onQueryChange={setQuery}
        inputRef={inputRef}
        onSearch={(q, mode) => search(q, mode)}
      />
    </div>
  );
}
