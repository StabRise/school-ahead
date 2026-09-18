# Project
school-ahead is a modern, gamified learning management platform designed specifically for homeschooling and alternative education. It streamlines the entire educational process by bridging the gap between students, tutors, and parents, turning independent learning into a seamless, engaging experience.

github: https://github.com/StabRise/school-ahead

@AGENTS.md

Do not overrire, remove .env files

# Technologies

## Frontend:

Folder: /frontend

next.js, tailwind, radix-ui, ui.shadcn
state manger: zustand
open api client: orval
react query
zod - form validation
next-intl - internationalization
vitest
bun - package manager
react-hook-form

## Backend:

Folder: /backend

Django Ninja,
postgres
pytest
uv - package manager
ruff - rust lint
ty - type checker

## Authentification:
google social auth
jwt

## General:
make
docker
docker-compose
github actions

# Documentation

## Core

- [Project Overview](docs/core/core.md)
- [Entity Relationships & Architecture](docs/core/data.md)
- [Interface Language & Localization](docs/core/languages.md)
- [Lesson Lifecycle and Statuses](docs/core/lessons.md)
- [Student Progress & "Ahead" Mode](docs/core/progress.md)
- [Gamification: Diamonds](docs/core/gamification.md)
- [Academic Dates and Schedule Planning](docs/core/schedule_planning.md)
- [Avatar Customization & Home Decoration](docs/core/avatar.md)

## Student Interface

- [Weekly Calendar (Student Main Screen)](docs/interfaces/student/calendar.md)
- [Lesson Screen Structure](docs/interfaces/student/lesson.md)
- [Subject Progress Screen](docs/interfaces/student/progress.md)
- [Student's Daily View ("Today")](docs/interfaces/student/today.md)
- [Subject Detail & Topic Workspace](docs/interfaces/student/subjects.md)
- ["My Subjects" — Student Dashboard & Subjects List](docs/interfaces/student/subjects_list.md)
- [Preschool Lesson View — Original Design Brief](docs/interfaces/student/preschool/lesson.md)

## Tutor Interface

- [Tutor Main Screen](docs/interfaces/tutor/main.md)

## Preschool Mode

- [Preschool View — what's actually built](docs/views/preschool/README.md)
- [Preschool View — original design brief (historical)](docs/views/preschool/ideas.md)

### Preschool Minigames

- [Balloon Pop Game](<docs/preschool/games/balloon game/README.md>)
- [Cards — study flashcards (grades 7-8)](docs/preschool/games/cards.md)
- [Cars Game ("Машинки" / Parking Math)](docs/preschool/games/cars.md)
- [Magic Cocktail Game](docs/preschool/games/cocktail.md)
- [Jumping Frogs Game](docs/preschool/games/jumping-frogs.md)
- [Math Runner Game](docs/preschool/games/multiplication.md)
- [Reading Game — "Склади" (Syllables)](docs/preschool/games/reading/README.md)
- [Reading Game — "Картки" (Cards)](docs/preschool/games/reading/Cards.md)
- [Reading Game — "Казки" (Stories)](docs/preschool/games/reading/Stories.md)

## Architecture

- [Overview](docs/architecture/00-overview.md)
- [Backend Apps](docs/architecture/01-backend-apps.md)
- [Data Model](docs/architecture/02-data-model.md)
- [Lesson Lifecycle](docs/architecture/03-lesson-lifecycle.md)
- [API Design](docs/architecture/04-api-design.md)
- [Auth Flow](docs/architecture/05-auth-flow.md)
- [Frontend Architecture](docs/architecture/06-frontend-architecture.md)
- [Open Questions](docs/architecture/07-open-questions.md)
- [Calendar Generation](docs/architecture/08-calendar-generation.md)
