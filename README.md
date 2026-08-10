# LekkiPortfel

Prywatna aplikacja do śledzenia całego majątku: akcji, ETF-ów,
kryptowalut, gotówki i pozostałych aktywów. Łączy bieżące wyceny,
historię rachunków, dywidendy, alokację oraz robocze wyliczenie PIT-38.

## Stos technologiczny

- React 19 i vinext
- TypeScript
- Firebase Authentication: e-mail i Google
- Cloud Firestore: osobny portfel dla każdego konta
- API NBP, CoinGecko i Yahoo Finance do kursów i notowań
- xAI do opcjonalnego dodawania aktywów z tekstu, głosu i obrazu

Projekt nie korzysta z Cloud Functions ani z dodatkowej lokalnej bazy danych.

## Uruchomienie lokalne

Wymagany jest Node.js `>=22.13.0`.

```bash
npm install
copy .env.example .env.local
npm run dev -- --hostname 0.0.0.0 --port 4173
```

Na tym samym komputerze aplikacja będzie dostępna pod adresem
`http://localhost:4173`. Inne urządzenia w tej samej sieci Wi-Fi mogą wejść
przez adres IPv4 komputera, na przykład `http://192.168.1.14:4173`.

## Firebase

1. W Firebase Console włącz logowanie przez **Email/Password** i **Google**.
2. Utwórz bazę **Cloud Firestore**.
3. Dodaj aplikację typu **Web**.
4. Uzupełnij zmienne `NEXT_PUBLIC_FIREBASE_*` w `.env.local` według
   `.env.example`.
5. Opublikuj zawartość `firestore.rules` w **Firestore Database → Rules**.

Portfel jest zapisywany w dokumencie `users/{uid}/portfolio/main`. Nowe konto
otrzymuje pusty dokument automatycznie przy pierwszym uruchomieniu.

## Dodawanie aktywów z tekstu, głosu i obrazu

W ignorowanym przez Git pliku `.env.local` ustaw serwerowy klucz:

```bash
XAI_API_KEY=tu_wpisz_klucz
XAI_MODEL=grok-4.3
```

Klucz nie trafia do przeglądarki. Rozpoznane pozycje są zapisywane dopiero po
zatwierdzeniu podglądu przez użytkownika.

## Kontrola jakości

```bash
npm run lint
npm test
```

`npm test` wykonuje produkcyjny build i testy kalkulatorów, importu, eksportu
oraz kluczowych elementów interfejsu.
