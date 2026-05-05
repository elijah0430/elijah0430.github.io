# Jongwon Lim GitHub Pages

Jongwon Lim 개인 연구자 홈페이지용 정적 GitHub Pages 템플릿입니다. 별도 빌드 과정 없이 `index.html`을 바로 배포할 수 있습니다.

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
