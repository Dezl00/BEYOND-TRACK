type Scene = 0 | 1 | 2;

function Check({ x, y, size = 24 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 24})`}>
      <circle r="24" fill="var(--art-green)" />
      <path
        d="m-10 0 7 7 14-15"
        fill="none"
        stroke="var(--art-paper)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
function Box({ x, y, size = 52 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 52})`}>
      <path d="m0 11 26-11 26 11v33L26 55 0 44z" fill="var(--art-box)" />
      <path
        d="m0 11 26 11 26-11M26 22v33"
        stroke="var(--art-box-line)"
        fill="none"
        strokeWidth="2"
      />
      <path
        d="m15 5 26 11v10l-10 5V20L5 9z"
        fill="var(--art-gold-dark)"
        opacity=".55"
      />
      <path
        d="m34 39 10-4"
        stroke="var(--art-box-line)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  );
}
function RequestScene() {
  return (
    <>
      <path
        d="M62 298V117h91v181m-66-2V93h79v203m-32-164V62h75v236"
        fill="var(--art-back)"
        stroke="var(--art-line)"
        strokeWidth="2"
      />
      {[0, 1, 2].flatMap((row) =>
        [0, 1].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={148 + col * 26}
            y={84 + row * 42}
            width="12"
            height="20"
            rx="2"
            fill="var(--art-mid)"
          />
        )),
      )}
      <path
        d="M59 330h442M107 94V45h187m-69 0 37 24M108 69h176m-30-24v82"
        fill="none"
        stroke="var(--art-line)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M249 126h11l-3 9h-5z" fill="var(--art-gold)" />
      <g transform="translate(92 214) rotate(-7 58 50)">
        <rect width="114" height="87" rx="10" fill="var(--art-ink)" />
        <rect
          x="8"
          y="8"
          width="98"
          height="65"
          rx="5"
          fill="var(--art-paper)"
        />
        <path
          d="M20 56V38h18v18m14 0V24h18v32m14 0V17"
          stroke="var(--art-mid)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="57" cy="80" r="2" fill="var(--art-line)" />
      </g>
      <rect
        x="252"
        y="100"
        width="207"
        height="224"
        rx="18"
        fill="var(--art-paper)"
      />
      <rect
        x="274"
        y="122"
        width="82"
        height="9"
        rx="4.5"
        fill="var(--art-ink)"
      />
      <rect
        x="274"
        y="141"
        width="126"
        height="5"
        rx="2.5"
        fill="var(--art-muted)"
      />
      {[0, 1, 2].map((row) => (
        <g key={row} transform={`translate(274 ${166 + row * 45})`}>
          <rect width="163" height="35" rx="7" fill="var(--art-wash)" />
          <rect
            x="10"
            y="9"
            width="17"
            height="17"
            rx="4"
            fill={row === 1 ? "var(--art-aqua)" : "var(--art-line)"}
          />
          <rect
            x="37"
            y="10"
            width={72 - row * 10}
            height="5"
            rx="2.5"
            fill="var(--art-label)"
          />
          <rect
            x="37"
            y="21"
            width="45"
            height="4"
            rx="2"
            fill="var(--art-muted)"
          />
          <path
            d="M137 17h13m-6-6v13"
            stroke="var(--art-mid)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      ))}
      <rect
        x="369"
        y="302"
        width="68"
        height="7"
        rx="3.5"
        fill="var(--art-mid)"
      />
      <circle cx="453" cy="99" r="28" fill="var(--art-aqua)" />
      <path
        d="M442 99h22m-11-11v22"
        stroke="var(--art-ink)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Box x={234} y={307} size={44} />
      <Box x={270} y={325} size={32} />
    </>
  );
}
function ApprovalScene() {
  return (
    <>
      <path
        d="M103 274v-89q0-20 20-20h309q20 0 20 20v89"
        fill="none"
        stroke="var(--art-line)"
        strokeWidth="3"
        strokeDasharray="6 9"
        strokeLinecap="round"
      />
      <path
        d="m116 262-13 13-13-13m349 0 13 13 13-13"
        fill="none"
        stroke="var(--art-line)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="191"
        y="81"
        width="177"
        height="224"
        rx="17"
        fill="var(--art-paper)"
      />
      <rect
        x="213"
        y="105"
        width="76"
        height="9"
        rx="4.5"
        fill="var(--art-ink)"
      />
      <rect
        x="213"
        y="124"
        width="120"
        height="5"
        rx="2.5"
        fill="var(--art-muted)"
      />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(214 ${153 + i * 31})`}>
          <rect width="15" height="15" rx="4" fill="var(--art-wash)" />
          <path
            d="m4 7 3 3 5-6"
            fill="none"
            stroke="var(--art-mid)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect
            x="25"
            y="4"
            width={100 - i * 18}
            height="6"
            rx="3"
            fill="var(--art-muted)"
          />
        </g>
      ))}
      <rect
        x="212"
        y="255"
        width="64"
        height="27"
        rx="7"
        fill="var(--art-green-wash)"
      />
      <path
        d="m224 268 5 5 10-11m8 5h16"
        fill="none"
        stroke="var(--art-green)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="60"
        y="216"
        width="143"
        height="113"
        rx="13"
        fill="var(--art-paper)"
      />
      <rect
        x="80"
        y="237"
        width="43"
        height="67"
        rx="6"
        fill="var(--art-mid)"
      />
      <rect
        x="87"
        y="244"
        width="29"
        height="13"
        rx="2"
        fill="var(--art-aqua)"
      />
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={87 + col * 10}
            y={266 + row * 10}
            width="5"
            height="5"
            rx="1.5"
            fill="var(--art-paper)"
          />
        )),
      )}
      <path
        d="M138 247h43m-43 13h30m-30 27h32"
        stroke="var(--art-muted)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <Check x={193} y={219} size={21} />
      <rect
        x="351"
        y="205"
        width="146"
        height="113"
        rx="13"
        fill="var(--art-paper)"
      />
      <rect
        x="367"
        y="221"
        width="77"
        height="79"
        rx="5"
        fill="var(--art-mid)"
      />
      <path
        d="M378 238h48v46h-48zm22 0v46m-22-23h48m-38-23v-7m28 7v-7m-38 20h-6m6 23h-6"
        stroke="var(--art-paper)"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="m459 239 20 20m-20 0 20-20m-15 42h15"
        stroke="var(--art-label)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Check x={487} y={207} size={21} />
      <circle cx="357" cy="87" r="28" fill="var(--art-aqua)" />
      <path
        d="m345 87 8 8 17-18"
        stroke="var(--art-ink)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M71 352h419"
        stroke="var(--art-line)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  );
}
function DeliveryScene() {
  return (
    <>
      <path
        d="M71 294V146l124-69 126 69v149"
        fill="var(--art-back)"
        stroke="var(--art-line)"
        strokeWidth="2"
      />
      <path
        d="M97 292V163h193v129m-168-1v-99h58v99m26 0v-99h59v99m-166-75h190"
        fill="none"
        stroke="var(--art-line)"
        strokeWidth="2"
      />
      <path
        d="M57 349h449"
        stroke="var(--art-line)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="76"
        y="201"
        width="188"
        height="112"
        rx="10"
        fill="var(--art-paper)"
      />
      <rect
        x="91"
        y="216"
        width="157"
        height="80"
        rx="6"
        fill="var(--art-wash)"
      />
      <path d="M265 236h49q11 0 17 11l25 39v32h-91z" fill="var(--art-aqua)" />
      <path d="M281 246h28q6 0 9 6l15 24h-52z" fill="var(--art-ink)" />
      <path
        d="M281 289h11"
        stroke="var(--art-mid)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect
        x="70"
        y="309"
        width="292"
        height="16"
        rx="5"
        fill="var(--art-ink)"
      />
      <circle cx="121" cy="326" r="22" fill="var(--art-ink)" />
      <circle cx="121" cy="326" r="10" fill="var(--art-muted)" />
      <circle cx="311" cy="326" r="22" fill="var(--art-ink)" />
      <circle cx="311" cy="326" r="10" fill="var(--art-muted)" />
      <Box x={115} y={231} size={44} />
      <Box x={166} y={231} size={44} />
      <g transform="translate(397 215)">
        <rect width="81" height="109" rx="11" fill="var(--art-ink)" />
        <rect
          x="7"
          y="8"
          width="67"
          height="89"
          rx="5"
          fill="var(--art-paper)"
        />
        <path
          d="M20 27h41m-41 13h26m-26 12h34"
          stroke="var(--art-muted)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="m24 74 9 9 21-23"
          stroke="var(--art-green)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="41" cy="103" r="2" fill="var(--art-line)" />
      </g>
      <Box x={351} y={308} size={43} />
      <path d="M389 127h66v61h-66z" fill="var(--art-paper)" />
      <rect
        x="405"
        y="120"
        width="34"
        height="13"
        rx="5"
        fill="var(--art-aqua)"
      />
      <path
        d="M401 145h34m-34 12h21"
        stroke="var(--art-muted)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Check x={453} y={174} size={24} />
    </>
  );
}
export default function LoginIllustration({ scene }: { scene: Scene }) {
  return (
    <svg
      viewBox="0 0 560 400"
      width="560"
      height="400"
      fill="none"
      className="login-illustration"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="280" cy="204" rx="208" ry="155" fill="var(--art-halo)" />
      {scene === 0 ? (
        <RequestScene />
      ) : scene === 1 ? (
        <ApprovalScene />
      ) : (
        <DeliveryScene />
      )}
    </svg>
  );
}
