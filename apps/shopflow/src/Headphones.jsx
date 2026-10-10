export default function Headphones({ mini = false }) {
  return <svg className={`headphones ${mini ? 'headphones-mini' : ''}`} viewBox="0 0 520 530" role="img" aria-label="Graphite Arc One wireless headphones, product illustration">
    <defs>
      <linearGradient id={`band-${mini}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#656b69" /><stop offset=".24" stopColor="#2c3333" /><stop offset=".65" stopColor="#101718" /><stop offset="1" stopColor="#68716d" /></linearGradient>
      <linearGradient id={`metal-${mini}`} x1="0" x2="1"><stop stopColor="#343e3e" /><stop offset=".35" stopColor="#a1a8a2" /><stop offset=".6" stopColor="#3c4947" /><stop offset="1" stopColor="#151e1e" /></linearGradient>
      <linearGradient id={`shell-${mini}`} x1="0" y1="0" x2="1" y2=".7"><stop stopColor="#717b74" /><stop offset=".25" stopColor="#46504c" /><stop offset=".55" stopColor="#252e2b" /><stop offset="1" stopColor="#101916" /></linearGradient>
      <linearGradient id={`cushion-${mini}`} x1="0" x2="1"><stop stopColor="#111715" /><stop offset=".45" stopColor="#3c4440" /><stop offset=".7" stopColor="#1b2420" /><stop offset="1" stopColor="#090e0c" /></linearGradient>
      <radialGradient id={`cup-${mini}`} cx=".3" cy=".2"><stop stopColor="#59645a" /><stop offset=".65" stopColor="#2d382f" /><stop offset="1" stopColor="#1c2620" /></radialGradient>
      <filter id={`shadow-${mini}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
      <filter id={`soft-${mini}`}><feGaussianBlur stdDeviation="1.2" /></filter>
    </defs>
    <ellipse cx="277" cy="472" rx="136" ry="19" fill="#344334" opacity=".13" filter={`url(#shadow-${mini})`} />
    <g transform="rotate(-15 260 270)">
      <path d="M112 329 L106 216 C105 102 165 52 257 51 C352 50 410 112 411 210 L412 329" fill="none" stroke="#18211e" strokeWidth="33" strokeLinecap="round" />
      <path d="M113 325 L108 214 C108 107 165 54 258 53 C350 52 406 112 408 211 L411 323" fill="none" stroke={`url(#band-${mini})`} strokeWidth="25" strokeLinecap="round" />
      <path d="M121 211 C119 111 176 69 258 66 C341 66 395 116 397 212" fill="none" stroke="#929b91" strokeOpacity=".35" strokeWidth="2" />
      <path d="M136 139 C164 88 205 72 258 71 C315 70 355 93 380 140" fill="none" stroke="#111b17" strokeWidth="13" strokeLinecap="round" />
      <path d="M109 230 L116 334" stroke={`url(#metal-${mini})`} strokeWidth="18" strokeLinecap="round" />
      <path d="M407 232 L404 329" stroke={`url(#metal-${mini})`} strokeWidth="18" strokeLinecap="round" />
      <path d="M116 320 Q76 331 95 371 L115 388" fill="none" stroke="#303d35" strokeWidth="11" strokeLinecap="round" />
      <path d="M404 320 Q440 340 421 377 L409 389" fill="none" stroke="#2b3a31" strokeWidth="11" strokeLinecap="round" />
      <g transform="rotate(-8 139 366)">
        <rect x="97" y="293" width="91" height="160" rx="43" fill={`url(#cushion-${mini})`} />
        <ellipse cx="159" cy="371" rx="26" ry="61" fill="#121d15" />
        <rect x="85" y="289" width="62" height="155" rx="29" fill={`url(#shell-${mini})`} stroke="#566357" strokeWidth=".7" />
        <path d="M95 317 Q93 297 115 298" fill="none" stroke="#9da397" strokeOpacity=".6" strokeWidth="1.5" />
        <line x1="95" y1="390" x2="97" y2="413" stroke="#87927e" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g transform="rotate(9 368 370)">
        <rect x="323" y="291" width="93" height="167" rx="45" fill={`url(#cushion-${mini})`} />
        <rect x="338" y="282" width="86" height="165" rx="42" fill={`url(#shell-${mini})`} stroke="#657565" strokeWidth=".8" />
        <rect x="350" y="292" width="66" height="145" rx="32" fill={`url(#cup-${mini})`} />
        <path d="M355 321 C357 306 366 300 379 299" fill="none" stroke="#9ea594" strokeOpacity=".7" strokeWidth="1" />
        <circle cx="383" cy="362" r="16" stroke="#b8c4a2" strokeOpacity=".36" strokeWidth="1" fill="none" />
        <path d="M377 364 L383 356 L389 364 M380 360 L383 367 L386 360" fill="none" stroke="#b8c4a2" strokeOpacity=".8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="409" cy="405" r="1.7" fill="#9cd0a0" />
      </g>
    </g>
  </svg>;
}
