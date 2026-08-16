# Wersjonowanie i wydania

## Wersja aplikacji

LekkiPortfel stosuje Semantic Versioning w formacie `MAJOR.MINOR.PATCH`. W fazie
rozwoju używamy linii `0.x`:

- `PATCH` (`0.1.0` → `0.1.1`) — poprawka błędu, refaktoryzacja, dokumentacja lub
  zmiana narzędziowa, która nie zmienia sposobu użycia aplikacji;
- `MINOR` (`0.1.0` → `0.2.0`) — nowa funkcja widoczna dla użytkownika albo
  świadomie wprowadzona niezgodność, dokładnie opisana w changelogu;
- `MAJOR` (`1.0.0`) — pierwszy stabilny kontrakt produktu. Od tego wydania
  niezgodne zmiany wymagają kolejnej wersji głównej.

Nie zwiększamy wersji dla każdego commita. Numer zmienia się dopiero podczas
przygotowania wydania.

## Commity

- Jeden commit powinien opisywać jedną spójną zmianę.
- Nazwa jest krótka, opisowa i zapisana w trybie rozkazującym, np.
  `Fix dividend forecast`.
- Commit nie może zawierać sekretów, danych użytkownika, plików lokalnego
  środowiska ani wygenerowanych artefaktów niewymaganych przez repozytorium.
- Zmiany funkcjonalne powinny zawierać testy odpowiednie do ryzyka.

## Przygotowanie wydania

1. Ustal numer według zasad powyżej.
2. Przenieś pozycje z sekcji `Unreleased` w `CHANGELOG.md` do sekcji z numerem
   i datą wydania.
3. Zmień wersję pakietu bez ręcznego modyfikowania pliku blokady zależności.
4. Uruchom lint, build oraz pełny zestaw testów.
5. Utwórz krótki commit wydania, np. `Release 0.2.0`, a po jego zatwierdzeniu tag
   `v0.2.0`.

Wydanie powstaje z czystej gałęzi `main`. Nie wydajemy wersji, jeśli migracja
danych nie ma testu albo kontrola CI nie przechodzi.

## Wersja schematu danych

Wersja aplikacji i `schemaVersion` portfela są niezależne. Schemat jest
monotoniczną liczbą całkowitą, a bieżąca wartość znajduje się w
`CURRENT_PORTFOLIO_SCHEMA_VERSION`.

Zasady zmian schematu:

- zmiana zapisywanej struktury, która wymaga przekształcenia istniejących danych,
  zwiększa `schemaVersion` dokładnie o 1;
- każda migracja prowadzi wyłącznie z `n` do `n + 1`;
- opublikowanej migracji nie edytujemy — korekta otrzymuje kolejną wersję;
- migracja musi zachować nieznane pola, o ile nie usuwa ich świadomie i nie jest
  to opisane w changelogu;
- dane bez `schemaVersion` są traktowane jako wersja 0;
- danych zapisanych przez nowszą, nieobsługiwaną wersję aplikacja nie może
  automatycznie nadpisywać;
- każda nowa migracja wymaga testu ścieżki od najstarszej obsługiwanej wersji do
  bieżącej oraz testu wielokrotnego uruchomienia migratora.

Przed wdrożeniem migracji należy wykonać próbę na kopii reprezentatywnych danych
i zapewnić możliwość przywrócenia poprzedniego zapisu. Zmiana samego numeru
schematu bez migracji nie jest dopuszczalna.
