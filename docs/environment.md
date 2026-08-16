# Konfiguracja środowiska

Skopiuj `.env.example` do `.env.local`, uzupełnij potrzebne wartości i ponownie uruchom serwer. Plik `.env.local` jest ignorowany przez Git i nie może trafić do repozytorium.

## Firebase

Konfiguracja Firebase jest wymagana do logowania i synchronizacji portfela z Firestore. W Firebase Console wybierz aplikację internetową, a następnie przepisz pola z obiektu `firebaseConfig`:

| Zmienna | Pole Firebase | Wymagana |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` | tak |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` | tak |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` | tak |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` | tak |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | tak |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` | tak |

Zmienne z prefiksem `NEXT_PUBLIC_` są celowo dostępne w przeglądarce. Nie są kluczami administracyjnymi i nie zastępują zabezpieczeń: dostęp do danych musi być ograniczony przez Firebase Authentication oraz reguły Firestore. Nie umieszczaj w nich kluczy kont usługowych ani innych sekretów.

## xAI

Integracja AI jest opcjonalna. Bez niej pozostałe funkcje portfela nadal działają.

| Zmienna | Znaczenie | Wymagana |
| --- | --- | --- |
| `XAI_API_KEY` | Klucz używany po stronie serwera przez analizę portfela i transkrypcję | tylko dla AI |
| `XAI_MODEL` | Model analizy portfela; domyślnie `grok-4.3` | nie |

`XAI_API_KEY` jest sekretem. Nie dodawaj do niego prefiksu `NEXT_PUBLIC_`, nie wpisuj go do kodu i nie commituj `.env.local`.

## Zmienne narzędziowe

`CODEX_SANDBOX`, `WRANGLER_WRITE_LOGS`, `WRANGLER_LOG_PATH` i `MINIFLARE_REGISTRY_PATH` są ustawieniami środowiska deweloperskiego. Nie są konfiguracją aplikacji i nie trzeba dodawać ich do `.env.local`; projekt ustawia bezpieczne wartości domyślne tam, gdzie są potrzebne.

## Kontrola przed uruchomieniem

- w `.env.local` nie powinno być `LEGACY_MIGRATION_KEY` ani innych nieużywanych zmiennych,
- prawdziwy `XAI_API_KEY` może znajdować się tylko w lokalnym lub serwerowym środowisku,
- po zmianie konfiguracji zatrzymaj i ponownie uruchom `npm run dev`,
- jeżeli Firebase nie jest skonfigurowany, aplikacja pokaże ekran konfiguracji zamiast formularza logowania.
