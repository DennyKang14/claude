"""발표자료 PDF 생성 (16:9, 크림 캔버스 · 코랄 포인트 디자인 기준)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyBboxPatch

SANS = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
SANS_B = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
SERIF = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Medium.ttc"
for f in (SANS, SANS_B, SERIF):
    try:
        fm.fontManager.addfont(f)
    except Exception:
        pass
fs = fm.FontProperties(fname=SANS)
fb = fm.FontProperties(fname=SANS_B)
try:
    fd = fm.FontProperties(fname=SERIF)
except Exception:
    fd = fb

CANVAS, CARD, INK, BODY, MUTED, CORAL, DARK, RULE = "#faf9f5", "#efe9de", "#141413", "#3d3d3a", "#6c6a64", "#cc785c", "#181715", "#e6dfd8"
W, H = 13.333, 7.5


def slide(pdf, kicker, title, draw=None, dark=False):
    fig = plt.figure(figsize=(W, H))
    fig.patch.set_facecolor(DARK if dark else CANVAS)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, W); ax.set_ylim(0, H); ax.axis("off")
    if kicker:
        ax.text(0.9, H - 0.9, kicker, fontproperties=fb, fontsize=12, color=CORAL)
    if title:
        ax.text(0.9, H - 1.55, title, fontproperties=fd, fontsize=30, color=("#faf9f5" if dark else INK), va="top")
    if draw:
        draw(ax)
    ax.text(W - 0.9, 0.45, "프랭클린 업무 플래너 · 전자금융사업팀", fontproperties=fs, fontsize=9, color=MUTED, ha="right")
    pdf.savefig(fig, facecolor=fig.get_facecolor()); plt.close(fig)


def card(ax, x, y, w, h, head, lines, fill=CARD, head_color=INK):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.18", fc=fill, ec="none"))
    ax.text(x + 0.3, y + h - 0.45, head, fontproperties=fb, fontsize=15, color=head_color, va="top")
    for i, ln in enumerate(lines):
        ax.text(x + 0.3, y + h - 1.05 - i * 0.42, ln, fontproperties=fs, fontsize=11.5, color=BODY, va="top")


def bullets(ax, items, x=0.9, y=H - 2.7, size=15, gap=0.62):
    for i, it in enumerate(items):
        ax.text(x, y - i * gap, "—", fontproperties=fs, fontsize=size, color=CORAL, va="top")
        ax.text(x + 0.45, y - i * gap, it, fontproperties=fs, fontsize=size, color=BODY, va="top")


with PdfPages("docs/presentation.pdf") as pdf:
    def cover(ax):
        ax.text(0.9, H - 1.2, "핑거 AX 전사교육 해커톤", fontproperties=fb, fontsize=13, color=CORAL)
        ax.text(0.9, H - 2.0, "프랭클린 업무 플래너", fontproperties=fd, fontsize=54, color="#faf9f5", va="top")
        ax.text(0.9, H - 3.5, "하루의 우선순위를 정하고, 끝까지 챙기는 데일리 업무·일정 관리", fontproperties=fs, fontsize=18, color="#a09d96", va="top")
        ax.text(0.9, 1.3, "전자금융사업팀  ·  Next.js · Supabase · Vercel", fontproperties=fs, fontsize=13, color="#a09d96")
    slide(pdf, "", "", cover, dark=True)

    slide(pdf, "문제", "업무는 흩어지고, 하루는 우선순위 없이 끝난다", lambda ax: bullets(ax, [
        "할 일이 메신저·메일·수첩·엑셀에 흩어져 오늘 무엇이 가장 중요한지 한눈에 보이지 않음",
        "못 끝낸 일이 다음 날로 넘어가며 조용히 사라지거나 몇 번째 미뤄졌는지 알 수 없음",
        "팀장 현황 보고를 위해 같은 내용을 매번 다시 정리",
        "동료에게 맡긴 일이 언제 끝났는지 따로 확인해야 함 — 위임 업무 누락",
        "규제 대응·계약 협의처럼 여러 날에 걸친 업무의 자료·결정 사항이 한곳에 모이지 않음",
    ]))

    def sol(ax):
        card(ax, 0.9, 1.2, 3.7, 3.6, "A·B·C 우선순위", ["A 반드시 · B 해야 할 · C 하면 좋은", "A1, A2… 번호로 처리 순서까지", "▲▼로 순서 조정"])
        card(ax, 4.8, 1.2, 3.7, 3.6, "상태 기호", ["✓ 완료  ● 진행  → 이월", "○ 위임  × 취소", "기호 클릭: 미착수→진행→완료"])
        card(ax, 8.7, 1.2, 3.7, 3.6, "하루 한 장", ["07~21시 시간대별 일정", "일일 기록(본인 전용, 자동 저장)", "주간 컴퍼스: 사명·역할·목표"])
    slide(pdf, "해결", "검증된 프랭클린 플래너 방식을 웹으로 옮겼습니다", sol)

    def feats(ax):
        rows = [("오늘", "우선순위 업무 · 일정 · 일일 기록, 지난 미결 업무 ‘모두 오늘로 이월’"),
                ("업무 상세", "마감일(D-day) · 프로젝트 · 체크리스트 · 자료 링크 · 관련 업무 · 진행 기록 · 코멘트"),
                ("이월", "원래 업무는 ‘→ 이월’로 남고 새 날짜에 이어받은 업무 생성, 이월 이력 추적"),
                ("주간 현황", "주간 완료율 · A업무 완료율 · 요일별 상태 막대 · 미결 업무 · 위임 추적"),
                ("프로젝트", "날짜를 넘나들며 관련 업무를 한 번에 보고 완료율 확인"),
                ("공유·위임", "사람마다 공유 수준 지정, 동료 위임함에서 수락·진행·완료"),
                ("데모 모드", "로그인 없이 예시 데이터로 모든 기능 체험 (/demo)")]
        for i, (k, v) in enumerate(rows):
            y = H - 2.75 - i * 0.62
            ax.text(0.9, y, k, fontproperties=fb, fontsize=14, color=INK, va="top")
            ax.text(3.0, y, v, fontproperties=fs, fontsize=13, color=BODY, va="top")
            ax.plot([0.9, W - 0.9], [y - 0.45, y - 0.45], color=RULE, lw=0.8)
    slide(pdf, "핵심 기능", "계획 → 실행 → 정리 → 공유를 한 흐름으로", feats)

    def share(ax):
        card(ax, 0.9, 1.2, 3.7, 3.7, "주간 요약만", ["예: 본부장", "완료율·A업무 완료율", "미결·위임 건수", "업무 제목·일정은 보이지 않음"])
        card(ax, 4.8, 1.2, 3.7, 3.7, "보기 + 코멘트", ["예: 팀장", "날짜별 업무·일정·프로젝트 열람", "업무에 코멘트 → 알림", "일일 기록은 비공개"])
        card(ax, 8.7, 1.2, 3.7, 3.7, "위임 협업", ["예: 함께 일하는 동료", "자기에게 위임된 업무만 보임", "수락·진행·완료 처리", "단계마다 위임자에게 알림"])
    slide(pdf, "공유", "보여줄 만큼만 공유합니다 — 사람마다 다른 공유 수준", share)

    def arch(ax):
        boxes = [(0.9, "GitHub", ["코드·DB 마이그레이션", "변경 이력 관리"]),
                 (4.8, "Vercel · Next.js", ["화면·서버 라우트", "이메일 로그인 콜백", "위임 알림 메일(선택)"]),
                 (8.7, "Supabase (서울)", ["Auth: 이메일 링크 로그인", "Postgres + RLS 권한", "Realtime: 코멘트·위임 즉시 반영"])]
        for x, h, ls in boxes:
            card(ax, x, 2.2, 3.7, 2.8, h, ls)
        for x in (4.6, 8.5):
            ax.annotate("", xy=(x + 0.2, 3.6), xytext=(x - 0.05, 3.6), arrowprops=dict(arrowstyle="->", color=CORAL, lw=2))
        ax.text(0.9, 1.4, "데이터는 모두 owner_id(주인)를 갖고, 공유는 shares 테이블의 수준으로만 열립니다. 동료도 자기 플래너를 따로 쓸 수 있습니다.", fontproperties=fs, fontsize=12, color=BODY)
    slide(pdf, "구성", "Vercel + Supabase, 권한은 DB가 직접 지킵니다", arch)

    slide(pdf, "안전한 권한 설계", "화면을 어떻게 조작해도 권한 밖 데이터는 DB에서 나오지 않습니다", lambda ax: bullets(ax, [
        "행 단위 보안(RLS): 모든 테이블에 공유 수준별 읽기·쓰기 규칙",
        "‘주간 요약만’은 테이블을 직접 못 읽고, 숫자만 돌려주는 함수(weekly_summary)로만 조회",
        "위임받은 동료는 제목·내용 수정 불가 — 진행 상태만 전용 함수(set_deleg_state)로 변경",
        "일일 기록은 어떤 공유 수준에도 열리지 않음 · 공유 해제 즉시 접근 차단",
        "진행 기록·알림은 DB 트리거가 자동 생성 — 사용자가 위조·삭제할 수 없음",
        "권한 확인 함수는 외부 API에 노출되지 않는 private 스키마에 배치 (Supabase 보안 점검 반영)",
    ], size=14))

    slide(pdf, "만든 방식", "SUPERPOWERS 절차로 기획부터 검증까지", lambda ax: bullets(ax, [
        "요구사항을 한 번에 하나씩 질문해 확정: 사용자 · 공유 범위 · 인프라 · 로그인 · 캘린더 · 기기",
        "구현 접근 3안 비교 → Next.js + Supabase RLS 안 선택",
        "설계를 섹션별로 승인: 시스템 구성 → 화면 → 데이터·권한 → 흐름 → 오류 처리·테스트",
        "클릭 가능한 화면 시안으로 먼저 검토, 업무 상세·관련 업무 요구를 시안에 즉시 반영",
        "테스트: 로직 단위 테스트 11건(Vitest) · 공유 수준 4종 × 데이터별 권한 검증 SQL",
        "디자인 시스템: 크림 캔버스 · 코랄 주요 동작 · 세리프 제목 · 다크/라이트 모드",
    ], size=14))

    slide(pdf, "시연과 다음 단계", "지금 바로 /demo 에서 체험할 수 있습니다", lambda ax: bullets(ax, [
        "시연: 상태 기호 클릭 → 업무 상세(체크리스트·자료·관련 업무) → 다른 날짜로 이월",
        "시연: 동료 위임함에서 ‘완료’ → 내 오늘 화면·주간 위임 추적에 즉시 반영",
        "다음 단계 ①: Google·Outlook 캘린더 가져오기 (일정 데이터에 출처 구분 이미 반영)",
        "다음 단계 ②: 휴대폰 푸시 알림, 파일 첨부(Supabase Storage)",
        "다음 단계 ③: AI 회의록과 연결해 회의 결정 사항을 업무로 자동 등록",
    ], size=14))
print("ok")
