import assert from 'node:assert/strict'

import {
  buildFirstBankCursor,
  createFirstBankTransactionQuerySubmission,
  extractFirstBankLoginAreaPoint,
  extractFirstBankLoginPageMeta,
  parseFirstBankCursor,
  parseFirstBankTransactions,
  resolveFirstBankSyncStartDate,
  splitFirstBankDateRange,
} from '../api/bank/_first-bank-provider.js'

const cursor = buildFirstBankCursor({
  initialStartDate: '2026-02-07',
})

assert.deepEqual(parseFirstBankCursor(cursor), {
  initialStartDate: '2026-02-07',
})

assert.equal(
  resolveFirstBankSyncStartDate({
    cursor,
    lastSyncAt: '',
    lookbackDays: 7,
  }),
  '2026-02-07',
)

assert.equal(
  resolveFirstBankSyncStartDate({
    cursor,
    lastSyncAt: '2026-03-01T12:34:56+08:00',
    lookbackDays: 7,
  }),
  '2026-03-01',
)

assert.deepEqual(
  splitFirstBankDateRange('2026-01-01', '2026-02-15'),
  [
    {
      startDate: '2026-01-01',
      endDate: '2026-01-30',
      startDateBank: '2026/01/01',
      endDateBank: '2026/01/30',
    },
    {
      startDate: '2026-01-31',
      endDate: '2026-02-15',
      startDateBank: '2026/01/31',
      endDateBank: '2026/02/15',
    },
  ],
)

const queryFormHtml = `
  <html>
    <body>
      <form action="../2/010103.html" method="post">
        <input type="hidden" name="foo" value="bar">
        <input type="hidden" name="acnt" value="old-account">
        <td nowrap="" class="ListTitleFont" align="right">
          <input id="txnStart" name="txnStart" type="text" value="2026/02/01" readonly="">
          <div id="startPicker" class="img-cla">
            <a href="#"><img alt="" src="/NetBank/img/c/icon-calendar.png"></a>~
          </div>
          <input id="txnEnd" name="txnEnd" type="text" value="2026/02/28" readonly="">
          <div id="endPicker" class="img-cla">
            <a href="#"><img alt="" src="/NetBank/img/c/icon-calendar.png"></a>
          </div>
          <input name="button4" type="button" class="MainButton" onclick="contract();" value="查詢">
        </td>
      </form>
    </body>
  </html>
`

assert.deepEqual(
  createFirstBankTransactionQuerySubmission(
    queryFormHtml,
    'https://ibank.firstbank.com.tw/NetBank/2/010103.html?acnt=29168214193',
    '29168214193',
    '2026-02-07',
    '2026-03-07',
  ),
  {
    method: 'POST',
    actionUrl: 'https://ibank.firstbank.com.tw/NetBank/2/010103.html',
    fields: {
      foo: 'bar',
      acnt: '29168214193',
      txnStart: '2026/02/07',
      txnEnd: '2026/03/07',
    },
  },
)

const loginHtmlWithDynamicArea = `
  <html>
    <body>
      <form name="form1" method="post" action="" autocomplete="off">
        <input type="hidden" id="encData" name="encData" value="">
        <input type="hidden" id="tag" name="tag" value="">
        <input type="hidden" name="position" id="position" value="">
        <input type="hidden" name="noneLg" value="Y">
        <input class="id-num" type="hidden" id="loginCustId" name="loginCustId" value="">
        <input class="id-num" type="text" id="loginCustIdFake" name="loginCustIdFake" value="">
        <input class="id-num-2" type="text" id="loginCustSeq" name="loginCustIdRptSeq" value="0">
        <input class="username" id="usrIdInput" type="password" name="usrId" value="">
        <input id="pwd" class="id-num" type="password" name="pwd" value="">
        <input class="verify-code" type="text" id="vrfyCode" name="vrfyCode" value="">
        <div class="btn-area-a">
          <img id="captchaLoginArea" title="請點擊登入按鈕位置以登入" usemap="#loginMap" src="/NetBank/loadloginArea.html">
          <map name="loginMap">
            <area shape="rect" coords="125,12,196,42" href="javascript:clickArea();">
          </map>
          <input type="hidden" name="hitX" id="hitXinput">
          <input type="hidden" name="hitY" id="hitYinput">
        </div>
      </form>
    </body>
  </html>
`

assert.deepEqual(
  extractFirstBankLoginAreaPoint(loginHtmlWithDynamicArea),
  {
    hitX: '161',
    hitY: '27',
  },
)

assert.deepEqual(
  extractFirstBankLoginPageMeta(loginHtmlWithDynamicArea),
  {
    formFields: {
      encData: '',
      tag: '',
      position: '',
      noneLg: 'Y',
      loginCustId: '',
      loginCustIdFake: '',
      loginCustIdRptSeq: '0',
      usrId: '',
      pwd: '',
      vrfyCode: '',
      hitX: '',
      hitY: '',
    },
    loginAreaPoint: {
      hitX: '161',
      hitY: '27',
    },
  },
)

const loginHtmlWithoutAreaMap = `
  <html>
    <body>
      <form name="form1" method="post" action="" autocomplete="off">
        <input type="hidden" id="encData" name="encData" value="">
        <input class="id-num" type="text" id="loginCustIdFake" name="loginCustIdFake" value="">
        <input class="username" id="usrIdInput" type="password" name="usrId" value="">
        <input id="pwd" class="id-num" type="password" name="pwd" value="">
        <input class="verify-code" type="text" id="vrfyCode" name="vrfyCode" value="">
        <img id="captchaLoginArea" src="/NetBank/loadloginArea.html">
        <input type="hidden" name="hitX" id="hitXinput">
        <input type="hidden" name="hitY" id="hitYinput">
      </form>
    </body>
  </html>
`

assert.deepEqual(
  extractFirstBankLoginAreaPoint(loginHtmlWithoutAreaMap),
  {
    hitX: '',
    hitY: '',
  },
)

const fixtureHtml = `
  <html>
    <body>
      <table class="CnbTable">
        <tr>
          <td>交易日期</td>
          <td>摘要</td>
          <td>存入</td>
          <td>支出</td>
          <td>餘額</td>
        </tr>
        <tr>
          <td>2026/03/07</td>
          <td>薪資入帳</td>
          <td>50,000</td>
          <td></td>
          <td>80,000</td>
        </tr>
        <tr>
          <td>2026/03/06</td>
          <td>超商消費</td>
          <td></td>
          <td>120</td>
          <td>30,000</td>
        </tr>
      </table>
    </body>
  </html>
`

const parsed = parseFirstBankTransactions(fixtureHtml, {
  accountId: '29168214193',
  rangeStart: '2026/03/01',
  rangeEnd: '2026/03/07',
})

assert.equal(parsed.length, 2)
assert.equal(parsed[0].providerAccountId, '29168214193')
assert.equal(parsed[0].amountMinor, 5000000)
assert.equal(parsed[0].description, '薪資入帳')
assert.equal(parsed[1].amountMinor, -12000)
assert.equal(parsed[1].description, '超商消費')

console.log('First Bank provider fixture checks passed')
