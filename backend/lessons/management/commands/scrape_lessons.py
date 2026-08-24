"""Scrapes an Open edX-style course outline page (e.g. the e-school.net.ua
LMS) into the TopicOut/LessonOut JSON shape used to seed lessons.

Usage:
    uv run manage.py scrape_lessons <course-outline-url> <name>

Writes lessons/scraped/<name>.json.
"""

import html
import json
import re
import time
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from ninja import Schema

USER_AGENT = 'Mozilla/5.0 (compatible; SchoolAheadScraper/1.0)'
REQUEST_TIMEOUT = 30
# Politeness delay between per-unit requests.
REQUEST_DELAY_SECONDS = 0.2

# Trailing "(5 завдань)" / "(3 tasks)" task-count suffix the theme appends
# to subsection titles in the outline — not part of the authored title.
TASK_COUNT_SUFFIX_RE = re.compile(r'\s*\([^)]*\)\s*$')

YOUTUBE_URL_RE = re.compile(
    r'(?:youtube\.com/(?:watch\?v=|embed/)|youtu\.be/)([\w-]+)'
)

# A lesson with no video/pdf materials is a pure quiz on the source
# platform (e.g. "Тематичне оцінювання") — we don't scrape its questions,
# so it's imported as a with_task lesson asking the student to prove they
# did it there instead.
ASSESSMENT_TASK_CONTENT = 'Надішли скрін виконаного тесту'


class LessonOut(Schema):
    title: str
    lesson_type: str
    origin_url: str
    youtubes: list[str]
    pdfs: list[str]
    content: str
    task_content: str


class TopicOut(Schema):
    title: str
    description: str
    lessons: list[LessonOut]


class Command(BaseCommand):
    help = 'Scrape an Open edX course outline page into TopicOut/LessonOut JSON.'

    def add_arguments(self, parser):
        parser.add_argument('url', help='URL of the course outline page (list of topics/lessons).')
        parser.add_argument('name', help='Output filename (without path) written under lessons/scraped/.')

    def handle(self, *args, **options):
        url = options['url']
        name = options['name']

        session = requests.Session()
        session.headers['User-Agent'] = USER_AGENT

        outline_html = self._get(session, url)
        base_url = f'{urlparse(url).scheme}://{urlparse(url).netloc}'

        topics = self._parse_outline(outline_html, base_url)
        if not topics:
            raise CommandError('No topics found on this page — is it a course outline page?')

        topics_out = []
        for topic in topics:
            self.stdout.write(f"Topic: {topic['title']} ({len(topic['lessons'])} lessons)")
            lessons_out = []
            for lesson in topic['lessons']:
                lessons_out.append(self._scrape_lesson(session, lesson, base_url))
            topics_out.append(
                TopicOut(title=topic['title'], description=topic['description'], lessons=lessons_out)
            )

        out_path = self._output_path(name)
        out_path.write_text(
            json.dumps([t.dict() for t in topics_out], ensure_ascii=False, indent=2),
            encoding='utf-8',
        )
        lesson_count = sum(len(t.lessons) for t in topics_out)
        self.stdout.write(self.style.SUCCESS(f'Wrote {lesson_count} lessons to {out_path}'))

        # JSON necessarily escapes embedded newlines as literal "\n" — fine
        # for a parser, unreadable if you open the .json and copy a
        # `content` value by hand. Also write each one out as a real .md
        # file (real line breaks) for that.
        md_dir = self._write_content_files(topics_out, name)
        self.stdout.write(self.style.SUCCESS(f'Wrote {lesson_count} content .md files to {md_dir}'))

    def _output_dir(self) -> Path:
        out_dir = Path(settings.BASE_DIR) / 'scraped.tmp'
        out_dir.mkdir(parents=True, exist_ok=True)
        return out_dir

    def _output_path(self, name: str) -> Path:
        filename = name if name.endswith('.json') else f'{name}.json'
        return self._output_dir() / filename

    def _write_content_files(self, topics_out: list[TopicOut], name: str) -> Path:
        md_dir = self._output_dir() / (name.removesuffix('.json'))
        md_dir.mkdir(parents=True, exist_ok=True)
        index = 0
        for topic in topics_out:
            for lesson in topic.lessons:
                index += 1
                filename = f'{index:02d}-{self._slugify(lesson.title)}.md'
                (md_dir / filename).write_text(lesson.content, encoding='utf-8')
        return md_dir

    def _slugify(self, text: str, max_len: int = 60) -> str:
        slug = re.sub(r'[^\w]+', '-', text, flags=re.UNICODE).strip('-_').lower()
        return slug[:max_len].rstrip('-_') or 'lesson'

    def _get(self, session: requests.Session, url: str) -> str:
        try:
            response = session.get(url, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise CommandError(f'Failed to fetch {url}: {exc}') from exc
        return response.text

    def _parse_outline(self, outline_html: str, base_url: str) -> list[dict]:
        soup = BeautifulSoup(outline_html, 'html.parser')
        topics = []
        for section in soup.select('li.outline-item.section'):
            title_tag = section.find('h3', class_='section-title')
            title = title_tag.get_text(strip=True) if title_tag else ''

            lessons = []
            for subsection in section.select('li.subsection'):
                subtitle_tag = subsection.find('h4', class_='subsection-title')
                raw_title = subtitle_tag.get_text(' ', strip=True) if subtitle_tag else ''
                lesson_title = TASK_COUNT_SUFFIX_RE.sub('', raw_title).strip()

                unit_links = [
                    urljoin(base_url, a['href'])
                    for a in subsection.select('li.unit a.unit-text[href]')
                ]
                if not lesson_title or not unit_links:
                    continue
                lessons.append({'title': lesson_title, 'unit_links': unit_links})

            if lessons:
                topics.append({'title': title, 'description': '', 'lessons': lessons})
        return topics

    def _scrape_lesson(self, session: requests.Session, lesson: dict, base_url: str) -> LessonOut:
        youtubes: list[str] = []
        pdfs: list[str] = []

        for link in lesson['unit_links']:
            content = self._fetch_unit_content(session, link)
            for video_id in self._extract_youtube_ids(content):
                if video_id not in youtubes:
                    youtubes.append(video_id)
            for pdf_url in self._extract_pdf_urls(content, base_url):
                if pdf_url not in pdfs:
                    pdfs.append(pdf_url)
            time.sleep(REQUEST_DELAY_SECONDS)

        origin_url = lesson['unit_links'][0]
        is_assessment = not youtubes and not pdfs
        return LessonOut(
            title=lesson['title'],
            lesson_type='with_task' if is_assessment else 'theory',
            origin_url=origin_url,
            youtubes=youtubes,
            pdfs=pdfs,
            content=self._build_content(lesson['title'], youtubes, pdfs, origin_url),
            task_content=ASSESSMENT_TASK_CONTENT if is_assessment else '',
        )

    def _build_content(self, lesson_title: str, youtubes: list[str], pdfs: list[str], origin_url: str) -> str:
        """Markdown for Lesson.content — order matters (see Markdown's
        embedYoutube/embedPdf in frontend/components/markdown.tsx): a bare
        YouTube link renders as an inline video embed, and a
        <pdfiframe file="..." title="..."/> tag renders as an inline PDF
        viewer."""
        sections = list(youtubes)

        if pdfs:
            title_attr = lesson_title.replace('"', '&quot;')
            pdf_tags = '\n'.join(f'<pdfiframe file="{pdf_url}" title="{title_attr}"/>' for pdf_url in pdfs)
            sections.append(f'## Конспект\n\n{pdf_tags}')

        sections.append(f'## ВШО\n\n[Переглянути на ВШО]({origin_url})')

        return '\n\n'.join(sections)

    def _fetch_unit_content(self, session: requests.Session, unit_url: str) -> BeautifulSoup:
        """The unit's rendered xblock tree is embedded HTML-escaped as the
        text content of #seq_contents_0 (unescaped client-side by the LMS's
        own JS) — unescape it once to get parseable HTML."""
        page_html = self._get(session, unit_url)
        soup = BeautifulSoup(page_html, 'html.parser')
        container = soup.find(id='seq_contents_0')
        if container is None:
            return BeautifulSoup('', 'html.parser')
        return BeautifulSoup(html.unescape(container.decode_contents()), 'html.parser')

    def _extract_youtube_ids(self, content: BeautifulSoup) -> list[str]:
        ids = []

        for video in content.find_all('div', attrs={'data-metadata': True}):
            try:
                metadata = json.loads(html.unescape(video['data-metadata']))
            except json.JSONDecodeError:
                continue
            for chunk in (metadata.get('streams') or '').split(','):
                chunk = chunk.strip()
                if ':' in chunk:
                    video_id = chunk.split(':', 1)[1].strip()
                    if video_id:
                        ids.append(video_id)

        for tag, attr in ((content.find_all('iframe', src=True), 'src'), (content.find_all('a', href=True), 'href')):
            for el in tag:
                match = YOUTUBE_URL_RE.search(el[attr])
                if match:
                    ids.append(match.group(1))

        seen = set()
        urls = []
        for video_id in ids:
            if video_id not in seen:
                seen.add(video_id)
                urls.append(f'https://www.youtube.com/watch?v={video_id}')
        return urls

    def _extract_pdf_urls(self, content: BeautifulSoup, base_url: str) -> list[str]:
        urls = []
        # iframes (the pdf xblock's inline preview) first — the LMS also
        # links the same file again lower down (e.g. a "sources" button)
        # via a differently-encoded URL; dedup below keeps this one.
        for el, attr in [(i, 'src') for i in content.find_all('iframe', src=True)] + [
            (a, 'href') for a in content.find_all('a', href=True)
        ]:
            value = el[attr]
            if value.lower().split('?')[0].endswith('.pdf'):
                urls.append(urljoin(base_url, value))

        seen = set()
        deduped = []
        for u in urls:
            key = self._pdf_dedup_key(u)
            if key not in seen:
                seen.add(key)
                deduped.append(u)
        return deduped

    def _pdf_dedup_key(self, url: str) -> str:
        """Same PDF can be linked via its short asset-v1: form or the
        content-addressed /assets/courseware/v1/<hash>/asset-v1:.../<name>
        form — both end in the same (percent-encoded) filename."""
        return unquote(re.split(r'[@/]', url)[-1]).lower()
