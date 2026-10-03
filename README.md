# Jongwon Lim GitHub Pages

Jongwon Lim 개인 연구자 홈페이지용 정적 GitHub Pages 템플릿입니다. 별도 빌드 과정 없이 `index.html`을 바로 배포할 수 있습니다.

## CV 자동 갱신

- CV의 원본은 홈페이지입니다. `index.html`의 자기소개·학력·수상·강의·봉사·경력과 `research.html`의 Publications/Preprints를 수정하세요.
- `main`에 반영하면 **Sync CV from homepage**가 `cv.html`, `cv.pdf`를 재생성해 커밋하고 GitHub Pages 재배포를 요청합니다. 로컬에서 수정만 한 내용은 아직 공개 CV에 반영되지 않습니다.
- 기존 **Settings → Pages → Deploy from a branch → main / (root)** 설정을 유지합니다. 추가 비밀번호나 개인 액세스 토큰은 필요하지 않습니다. 저장소 정책에서 Actions의 `contents: write`, `pages: write` 및 main 직접 커밋이 허용되어야 합니다.
- 자동 커밋은 일반 push처럼 Pages 배포를 유발하지 않으므로 [Pages build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)를 명시적으로 호출합니다. 최초 push 후 Actions에서 성공 여부를 확인하세요.
- CV에 넣지 않는 항목: Recent News, Contact 폼, 블로그 글, 게임. 본문 내용이 같으면 갱신 날짜와 PDF도 바뀌지 않습니다.
- 새 경력 항목은 기존 `article.entry` 형식, 새 논문은 기존 `article.paper` 형식을 복사하세요. 저자 `*`, 게재 학회, 링크, emergency reviewer 문구도 그대로 반영됩니다. 새 경력 섹션도 자동 포함되며, 제외하려면 섹션에 `data-cv-exclude`를 붙입니다. 필수 섹션/필드가 없어지면 누락된 CV를 덮어쓰지 않고 검증이 실패합니다.
- `cv.html`, `cv.pdf`는 생성 결과이므로 직접 수정하지 마세요. 레이아웃은 `scripts/cv.css`(HTML)와 `scripts/generate_cv_pdf.py`(PDF)에서 관리합니다.

로컬에서 바로 재생성 및 검증:

```sh
python -m pip install -r scripts/requirements-cv.txt
python scripts/generate_cv_pdf.py
python -m unittest discover -s tests -p 'test_cv.py' -v
```

자동 갱신 커밋 이후 로컬 작업을 이어갈 때는 먼저 `git pull --ff-only`로 생성된 CV를 가져오세요.

## 포함 파일

```text
.
├── index.html
├── README.md
├── .nojekyll
└── assets
    ├── css/styles.css
    ├── js/main.js
    └── img/
        ├── favicon.svg
        ├── jl-avatar.svg
        ├── value-paper-preview.jpg
        └── value-paper-preview.webp
```

## 배포 방법

1. GitHub에서 `USERNAME.github.io` 형식의 repository를 만듭니다.
2. 이 폴더의 파일들을 repository 최상위에 업로드합니다.
3. repository의 **Settings → Pages**에서 branch를 `main` / root로 설정합니다.
4. 몇 분 후 `https://USERNAME.github.io`에서 페이지를 확인합니다.

## 수정하면 좋은 부분

- `index.html`의 자기소개 문단을 더 개인적인 연구 statement로 확장
- 실제 프로필 사진이 있다면 `assets/img/profile.jpg`를 추가한 뒤, `index.html`의 `jl-avatar.svg` 경로를 교체
- 논문 OpenReview / PDF / project page 링크가 확정되면 publication card의 버튼 추가
- 이메일을 공개할 계획이면 Contact section에 `mailto:` 링크 추가

## 디자인 특징

- 반응형 single-page academic homepage
- 다크/라이트 모드 토글
- Google Scholar, LinkedIn, Lab page 연결
- publication preview image 포함
- GitHub Pages에서 바로 동작하는 plain HTML/CSS/JS 구조
