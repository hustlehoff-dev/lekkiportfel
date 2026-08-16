# Changelog

Istotne zmiany w LekkiPortfel są zapisywane w tym pliku. Projekt stosuje
[Semantic Versioning](https://semver.org/lang/pl/) zgodnie z zasadami opisanymi
w [`docs/versioning.md`](docs/versioning.md).

## [Unreleased]

### Added

- Logowanie przez Firebase oraz oddzielne portfele użytkowników.
- Import danych XTB i zachowanie danych potrzebnych do obliczeń podatkowych.
- Kalkulator PIT-38, rozliczanie strat z poprzednich lat oraz raport roczny.
- Widoki portfela, dywidend, podatków i wykresów rynkowych.
- Filtrowanie portfela według dostawcy i rynku.
- Obsługa aktywów stablecoinowych, logotypów aktywów i prywatnego widoku kwot.
- Przełączanie motywu, waluty prezentacji i koloru akcentów wykresów.
- Wersjonowany schemat danych portfela z migracją danych starszego formatu do wersji 1.
- Automatyczna kontrola lint, build i testów w GitHub Actions.

### Changed

- Uporządkowano widoki mobilne, nawigację i układ podsumowania portfela.
- Ujednolicono widok wykresów z główną nawigacją aplikacji.
- Doprecyzowano prognozy dywidend i dodano wskaźniki stopy dywidendy.
- Ograniczono skutki limitów dostawcy notowań przez obsługę zapisanych danych.

### Fixed

- Poprawiono grupowanie pozycji, kalkulacje portfela i szacunek podatku przy likwidacji.
- Usunięto dane demonstracyjne i pozostałości interfejsu prototypowego.

[Unreleased]: https://github.com/hustlehoff-dev/lekkiportfel/commits/main
