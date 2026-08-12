import Link from "next/link";
import { Icon } from "@/components/Icon";

export const metadata = {
  title: "개인정보 처리방침 · 러닝크루",
  description: "러닝크루 개인정보 처리방침",
};

const UPDATED = "2026년 7월 11일";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <header className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--md-sys-color-primary)] hover:underline"
        >
          <Icon name="arrow_back" size={16} />
          돌아가기
        </Link>
        <h1 className="text-3xl font-black text-[var(--md-sys-color-on-surface)]">
          개인정보 처리방침
        </h1>
        <p className="mt-2 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          시행일: {UPDATED}
        </p>
      </header>

      <div className="flex flex-col gap-7 text-[15px] leading-relaxed text-[var(--md-sys-color-on-surface)]">
        <section>
          <p>
            러닝크루(이하 “본 서비스”)는 「개인정보 보호법」 제30조에 따라
            정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게
            처리할 수 있도록 하기 위하여 다음과 같이 개인정보 처리방침을
            수립·공개합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제1조 (개인정보의 수집·이용 목적)
          </h2>
          <p className="mb-2">
            본 서비스는 다음의 목적을 위하여 개인정보를 수집·이용합니다. 처리하는
            개인정보는 다음의 목적 이외의 용도로는 이용하지 않으며, 이용 목적이
            변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는
            등 필요한 조치를 이행합니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>학급 구성원 식별 및 관리, 교사의 학습 피드백 제공</li>
            <li>
              서비스 제공: 학습 활동·과제 제출 및 기록 저장, 게임·지식맵 등 학습
              이력 관리
            </li>
            <li>인공지능을 활용한 학습 분석·요약·피드백 제공</li>
            <li>서비스 개선, 오류 진단 및 이용자 문의·피드백 처리</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제2조 (개인정보의 수집 방법 및 동의)
          </h2>
          <p className="mb-2">
            본 서비스는 다음의 방법으로 개인정보를 수집합니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>교사</b>: Google 계정 로그인을 통한 수집
            </li>
            <li>
              <b>학생</b>: 교사가 발급한 학급 참여코드로 접속하여 표시 이름(또는
              닉네임)을 입력하는 방식으로 수집
            </li>
            <li>서비스 이용 과정에서 이용자가 직접 입력·제출한 학습 활동 정보</li>
          </ul>
          <p className="mt-2">
            이용자는 회원가입 및 서비스 이용 과정에서 본 처리방침의 내용을 확인하고
            동의한 후 서비스를 이용하며, 만 14세 미만 아동에 대해서는 제4조에서
            정한 바에 따릅니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제3조 (개인정보의 최소 수집 원칙)
          </h2>
          <p className="mb-2">
            본 서비스는 제1조의 목적을 달성하기 위하여 필요한 최소한의 개인정보만을
            수집하며, 최소한의 정보 외의 개인정보 수집에는 동의하지 않을 수 있고
            이 경우에도 서비스의 기본 이용에는 제한이 없도록 설계하였습니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              학생에게서는 표시 이름과 학습 활동 등 수업에 필요한 최소한의 정보만
              수집합니다.
            </li>
            <li>
              목적 달성에 필요하지 않은 정보와, 주민등록번호·주소·전화번호 등
              불필요한 민감·식별정보는 수집하지 않습니다.
            </li>
          </ul>
          <p className="mt-2">
            수집하는 개인정보의 구체적인 항목과 보유기간은 제8조에서 정하는 바에
            따릅니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제4조 (만 14세 미만 아동의 개인정보 보호)
          </h2>
          <p className="mb-2">
            본 서비스는 초등학교 등 학교 수업을 지원하는 도구로, 만 14세 미만
            아동이 이용할 수 있습니다. 본 서비스는 아동의 개인정보 보호를 위하여
            다음의 절차를 마련하고 있습니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              만 14세 미만 아동의 개인정보는 법정대리인의 동의를 받거나, 학교가
              「초·중등교육법」 등 관계 법령 및 교육 목적에 따라 학교장의 책임
              아래 처리합니다.
            </li>
            <li>
              아동에게서는 수업에 필요한 최소한의 정보(표시 이름·학습 활동)만
              수집하며, 직접 식별정보의 수집을 최소화하도록 설계하였습니다.
            </li>
            <li>
              법정대리인은 아동의 개인정보에 대한 열람·정정·삭제·처리정지를
              요구할 수 있으며, 요청 시 지체 없이 필요한 조치를 합니다(제11조·
              제14조).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제5조 (인공지능 기능에 관한 사항)
          </h2>
          <p className="mb-2">
            본 서비스는 개념 추출·요약·학습 피드백·의미 기반 지식맵 생성을 위해
            인공지능(AI) 기술을 사용하며, 이를 위해 이용자가 입력한 학습 데이터의
            일부(예: 제출한 단어·문장)가 분석 및 처리될 수 있습니다.
          </p>
          <p>
            분석에 사용되는 데이터는 필요한 학습 내용으로 한정하며, 가능한 범위에서
            직접 식별정보를 포함하지 않도록 합니다. AI가 생성한 분석·피드백은 학습
            보조를 위한 참고 자료이며 항상 정확함을 보장하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제6조 (개인정보의 파기 절차 및 방법)
          </h2>
          <p className="mb-2">
            ① 보유기간의 경과, 처리목적 달성 등으로 개인정보가 불필요하게 되었을
            때에는 지체 없이 해당 개인정보를 파기합니다.
          </p>
          <p>
            ② 전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없는 방법으로
            영구 삭제합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제7조 (개인정보의 제3자 제공)
          </h2>
          <p>
            본 서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다
            <b>(해당 없음)</b>. 다만 정보주체의 동의가 있거나 법률에 특별한 규정이
            있는 등 「개인정보 보호법」 제17조·제18조에 해당하는 경우에 한하여
            제공할 수 있으며, 이 경우 제공 목적·항목·보유기간 등을 사전에 안내하고
            필요한 동의를 받습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제8조 (수집하는 개인정보의 항목·보유기간 및 처리 위탁)
          </h2>
          <p className="mb-1 font-semibold">① 수집하는 개인정보 항목</p>
          <ul className="mb-3 list-disc space-y-1.5 pl-5">
            <li>
              <b>교사</b>: Google 계정 로그인 시 제공되는 이름, 이메일, 프로필
              이미지, 계정 식별자
            </li>
            <li>
              <b>학생</b>: 학급 참여 시의 표시 이름(또는 닉네임) 등 최소 정보
            </li>
            <li>
              <b>학습 활동 정보</b>: 제출한 글·단어·답안, 설문·성찰 응답, 게임
              참여·기록, 칭찬·미션 등 활동 데이터
            </li>
            <li>
              <b>첨부 파일</b>: 이용자가 업로드한 사진·음성 등
            </li>
            <li>
              <b>서비스 이용 정보</b>: 접속 시각, 기기·브라우저 정보(오류 진단·
              피드백 처리 목적)
            </li>
          </ul>
          <p className="mb-1 font-semibold">② 보유·이용기간</p>
          <ul className="mb-3 list-disc space-y-1.5 pl-5">
            <li>
              학급·회원 정보: 학급 운영 목적이 달성되거나 회원 탈퇴 또는 삭제 요청
              시까지
            </li>
            <li>
              학습 활동 데이터: 교사가 해당 학급·활동을 삭제하면 관련 데이터가
              함께 삭제됩니다.
            </li>
            <li>관련 법령에서 보관을 요구하는 경우 해당 기간 동안 보관합니다.</li>
          </ul>
          <p className="mb-1 font-semibold">③ 개인정보 처리업무의 위탁</p>
          <p className="mb-2">
            본 서비스는 원활한 서비스 제공 및 데이터 관리를 위하여 다음과 같이
            개인정보 처리업무를 위탁하고 있으며, 위탁계약 시 개인정보가 안전하게
            관리되도록 관련 사항을 규정하고 있습니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>수탁자</b>: Google (Firebase — Cloud Firestore·Storage·
              Authentication)
            </li>
            <li>
              <b>위탁 업무</b>: 서비스 호스팅, 데이터베이스·파일 저장, 인증 및
              시스템 보안 유지
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제9조 (개인정보의 안전성 확보조치)
          </h2>
          <p className="mb-2">
            본 서비스는 「개인정보 보호법」 제29조에 따라 다음과 같이 안전성 확보에
            필요한 조치를 하고 있습니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              접근 권한 관리: 교사·학급 멤버 권한을 분리하고 서버 보안 규칙을 통해
              데이터 접근을 통제합니다.
            </li>
            <li>
              보안 통신: 전 구간 보안 통신(HTTPS)을 사용하여 데이터를 암호화하여
              전송합니다.
            </li>
            <li>
              취급 인원 최소화: 개인정보를 처리하는 담당 인원을 최소화하여 접근
              권한을 관리합니다.
            </li>
            <li>
              접근 통제 및 점검: 서버 접근 기록을 관리하고 보안 설정을 주기적으로
              점검합니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제10조 (개인정보 자동 수집 장치의 설치·운영 및 거부)
          </h2>
          <p>
            본 서비스는 로그인 상태 유지 등 서비스 제공에 필요한 최소한의 쿠키 및
            브라우저 저장소를 사용하며, 광고·행태정보 수집을 목적으로 하는 자동
            수집 장치는 사용하지 않습니다. 이용자는 브라우저 설정을 통해 저장을
            거부할 수 있으나, 이 경우 로그인 유지 등 일부 기능 이용이 제한될 수
            있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제11조 (정보주체의 권리·의무 및 행사방법)
          </h2>
          <p className="mb-2">
            ① 정보주체(학생) 및 그 법정대리인은 언제든지 개인정보에 대한
            열람·정정·삭제·처리정지를 요구할 수 있습니다.
          </p>
          <p>
            ② 권리 행사는 서비스 내 삭제 기능을 통하여 직접 하거나, 제12조의
            개인정보 보호책임자 연락처로 요청할 수 있으며, 요청 시 지체 없이
            조치합니다. 학생은 교사 또는 보호자를 통해서도 권리를 행사할 수
            있습니다. 구체적인 행사 방법 및 권익침해 구제 절차는 제14조와
            같습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제12조 (개인정보 보호책임자)
          </h2>
          <p>
            본 서비스는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 정보주체의
            문의·불만 처리 및 피해 구제 등을 위하여 아래와 같이 개인정보 보호책임자를
            지정하고 있습니다.
            <br />
            <b>개인정보 보호책임자</b>: 러닝크루 운영자
            <br />
            이메일:{" "}
            <a
              href="mailto:jammanbogem@gmail.com"
              className="font-semibold text-[var(--md-sys-color-primary)] hover:underline"
            >
              jammanbogem@gmail.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제13조 (개인정보 처리방침의 변경)
          </h2>
          <p>
            이 개인정보 처리방침은 {UPDATED}부터 적용됩니다. 법령이나 운영 정책에
            따라 내용이 변경되는 경우 개정일과 함께 서비스 내에 공지합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제14조 (권리 행사 방법 및 권익침해 구제)
          </h2>
          <p className="mb-2">
            ① 정보주체는 개인정보 열람·정정·삭제·처리정지 등의 권리 행사를 제12조의
            보호책임자 연락처(이메일)로 요청할 수 있으며, 본 서비스는 요청을 받은
            즉시 지체 없이 처리합니다.
          </p>
          <p className="mb-2">
            ② 정보주체는 개인정보 침해로 인한 구제를 받기 위하여 아래 기관에 분쟁
            해결이나 상담 등을 신청할 수 있습니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>개인정보분쟁조정위원회: (국번없이) 1833-6972 (www.kopico.go.kr)</li>
            <li>
              개인정보침해신고센터: (국번없이) 118 (privacy.kisa.or.kr)
            </li>
            <li>대검찰청 사이버수사과: (국번없이) 1301 (www.spo.go.kr)</li>
            <li>경찰청 사이버수사국: (국번없이) 182 (ecrm.police.go.kr)</li>
          </ul>
        </section>
      </div>

      <footer className="mt-10 flex gap-4 border-t border-[var(--md-sys-color-outline-variant)] pt-6 text-sm">
        <Link
          href="/terms"
          className="font-semibold text-[var(--md-sys-color-primary)] hover:underline"
        >
          이용약관
        </Link>
        <Link
          href="/"
          className="font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:underline"
        >
          홈으로
        </Link>
      </footer>
    </main>
  );
}
