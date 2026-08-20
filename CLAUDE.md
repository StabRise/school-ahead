# Project
school-ahead is a modern, gamified learning management platform designed specifically for homeschooling and alternative education. It streamlines the entire educational process by bridging the gap between students, tutors, and parents, turning independent learning into a seamless, engaging experience.

github: https://github.com/StabRise/school-ahead

@AGENTS.md

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
postgres, django-q
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

## Student Interface

- [Weekly Calendar (Student Main Screen)](docs/interfaces/student/calendar.md)
- [Lesson Screen Structure (Wizard)](docs/interfaces/student/lesson.md)
- [Subject Progress Screen](docs/interfaces/student/progress.md)
- [Student's Daily View ("Day View")](docs/interfaces/student/today.md)

## Tutor Interface

- [Tutor Main Screen ("Rapid Response Dashboard")](docs/interfaces/tutor/main.md)

