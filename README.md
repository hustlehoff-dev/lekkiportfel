# LekkiPortfel

LekkiPortfel to aplikacja do śledzenia majątku inwestora w jednym miejscu. Łączy akcje, ETF-y, kryptowaluty, stablecoiny, gotówkę i inne aktywa z historią rachunków, dywidendami, analizą portfela oraz roboczym rozliczeniem PIT-38.

## Stack

- React 19 i TypeScript
- Vinext 0.0.50 (zgodność z API i strukturą Next.js na Vite)
- Firebase Authentication: e-mail/hasło i Google
- Cloud Firestore: oddzielny portfel każdego użytkownika
- API NBP, CoinGecko i Yahoo Finance: kursy walut, notowania i historia rynku
- xAI: opcjonalna analiza tekstu, obrazu i głosu
- Cloudflare Vite Plugin: lokalne środowisko tras serwerowych

Projekt nie wymaga Firebase Cloud Functions ani lokalnej bazy danych.

## Wymagania

- Git
- Node.js `>=22.13.0`
- npm
- projekt Firebase z aplikacją typu Web

## Uruchomienie od czystego klona

```powershell
git clone https://github.com/hustlehoff-dev/lekkiportfel.git
cd lekkiportfel
npm ci
Copy-Item .env.example .env.local
```

Uzupełnij `.env.local` zgodnie z sekcją Firebase, a następnie uruchom aplikację:

```powershell
npm run dev -- -p 4173
```

Adres na tym komputerze: [http://localhost:4173](http://localhost:4173).

### Dostęp przez Wi-Fi

Serwer deweloperski nasłuchuje na `0.0.0.0`, ponieważ jest to ustawione w `vite.config.ts`. Sprawdź lokalny adres IPv4:

```powershell
ipconfig
```

Na telefonie lub innym urządzeniu w tej samej sieci otwórz `http://ADRES_IPV4:4173`, na przykład `http://192.168.1.14:4173`. Jeżeli strona się nie otwiera, zezwól Node.js na połączenia prywatne w Zaporze Windows.

## Konfiguracja Firebase

1. W [Firebase Console](https://console.firebase.google.com/) otwórz projekt i dodaj aplikację typu **Web**.
2. W **Authentication → Sign-in method** włącz **Email/Password** oraz **Google**.
3. Utwórz bazę **Cloud Firestore**.
4. W **Firestore Database → Rules** wklej zawartość `firestore.rules` i opublikuj reguły.
5. W **Authentication → Settings → Authorized domains** dodaj domeny używane lokalnie, w tym adres IPv4 komputera, jeśli logowanie Google ma działać przez Wi-Fi.
6. Z obiektu `firebaseConfig` przepisz wartości do `.env.local`:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Po zmianie konfiguracji uruchom serwer ponownie. Portfel jest zapisywany w dokumencie `users/{uid}/portfolio/main`. Obecne reguły dopuszczają dostęp wyłącznie zalogowanemu właścicielowi z potwierdzonym adresem e-mail.

Pełny opis zmiennych i zasad bezpieczeństwa znajduje się w [docs/environment.md](docs/environment.md). Plik `.env.local` jest ignorowany przez Git i nie może trafić do repozytorium.

## Opcjonalna integracja xAI

Pozostałe funkcje aplikacji działają bez xAI. Aby włączyć analizę tekstu, obrazu i głosu, ustaw w `.env.local`:

```dotenv
XAI_API_KEY=
XAI_MODEL=grok-4.3
```

`XAI_API_KEY` jest sekretem serwerowym. Nie dodawaj do niego prefiksu `NEXT_PUBLIC_` i nie zapisuj go w repozytorium.

## Komendy

| Komenda | Działanie |
| --- | --- |
| `npm run dev -- -p 4173` | uruchamia środowisko deweloperskie na porcie 4173 |
| `npm run lint` | sprawdza kod przez ESLint |
| `npm run build` | tworzy build produkcyjny Vinext |
| `npm test` | wykonuje build i wszystkie testy Node |
| `npm run start` | uruchamia wcześniej zbudowaną wersję |
| `npm run logos:check` | sprawdza lokalną bazę logotypów |
| `npm run logos:sync` | synchronizuje logotypy według pliku źródeł |

## Struktura repozytorium

```text
app/                 widoki, style, komponenty i trasy API
app/wykresy/         widok wykresów rynkowych
lib/                 kalkulatory, Firebase i logika domenowa
worker/              punkt wejścia środowiska Cloudflare/Vinext
public/               fonty, favicon i lokalne logotypy aktywów
data/                 źródła i mapowanie logotypów
scripts/              skrypty utrzymaniowe
tests/                testy Node
docs/                 dokumentacja techniczna
firestore.rules       reguły dostępu do Firestore
vite.config.ts        konfiguracja Vinext, Vite i serwera lokalnego
.env.example          wzór konfiguracji środowiska
```

Kod aplikacji znajduje się przede wszystkim w `app/` i `lib/`. Katalogi generowane podczas instalacji i budowania nie są częścią kodu źródłowego.
