export const Devbar = () => `
  <section class="dev-bar" id="devBar">
    <span class="chip">📐 604 × 1074 — Full HD 세로 키오스크</span>
    <div class="controls">
      <label>미리보기 크기
        <input type="range" id="sl" min="20" max="100" value="40" />
        <span class="sv" id="sv">40%</span>
      </label>
      <button class="btn-full" id="btnFull">⛶ 풀스크린 미리보기</button>
    </div>
  </section>
`