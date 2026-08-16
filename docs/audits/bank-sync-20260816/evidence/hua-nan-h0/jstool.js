// Add by David Wen (2002/12/18)
// 檢核輸入的值是否為空字串或者NULL
function checkNull( value ){
      var size = value.length;
      var tag = " ";
      var i = 0;
      while(i<size) {
 	var temv = value.charAt(i);
	if ( temv == tag ) {
             i++;
	     continue;		    
	} else {
	     break;
	}	
      }
      var bis = i==size || value==null;
      return bis;
}


// 檢核輸入的日期是否為正確的日期
function isDate(theYear, theMonth, theDate) {
	// theYear: 四位數的西元年
	// theMonth: 從1到12的月份
	// theDate: 從1到31的日期
	//alert(theYear);
	
	if(theYear<=0)
		return false;
	else if (theYear<1911)
		theYear=theYear*1+1911;
		
	if(theMonth < 1 || theMonth > 12)
		return false;
	if(theDate < 1 || theDate > 31)
		return false;
	if(theMonth == 2 && theDate > 28){
		if(theDate == 29 && theYear % 4 == 0) {
			if (theYear % 100 == 0 && theYear % 400 != 0) //被100除的盡,可是400除不進的則不是潤年
				return false;
			else
				return true;
		}
		//if(theDate == 29 && theYear % 4 == 0 && theYear % 400 == 0) {
		//	return true;
		//}
		return false;
	}
	if(theMonth == 1 || theMonth == 3 || theMonth == 5 ||
	   theMonth == 7 || theMonth == 8 || theMonth == 10 ||  theMonth == 12)
		if(theDate > 31 || theDate < 1)
			return false;
	if(theMonth == 4 || theMonth == 6 || theMonth == 9 || theMonth == 11)
		if(theDate > 30 || theDate < 1)
			return false;
	return true;
}
// 檢核輸入的日期是否晚於今天
function isFuture(theYear, theMonth, theDate){
	// theYear: 四位數的西元年
	// theMonth: 從1到12的月份
	// theDate: 從1到31的日期
	if(!isDate(theYear, theMonth, theDate))
		return false;
	var today = new Date();
	today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	var theDay = new Date(theYear, theMonth-1, theDate);
	if(today >= theDay)
		return false;
	return true;
}
// 顯示當前的日期/時間 格式：yyyy/mm/dd hh:mm:ss(民國年)
function writeNow(){
	var d = new Date();
	document.write(( d.getFullYear() - 1911 ) + '/'
			+ ( d.getMonth() + 1 ) + '/'
			+ d.getDate() + ' '
			+ d.getHours() + ':'
			+ d.getMinutes() + ':'
			+ d.getSeconds()
			);
}
// 顯示當前的日期/時間 格式：yyyy/mm/dd hh:mm:ss(西元年)
function writeNowE(){
	var d = new Date();
	document.write( d.getFullYear() + '/'
			+ ( d.getMonth() + 1 ) + '/'
			+ d.getDate() + ' '
			+ d.getHours() + ':'
			+ d.getMinutes() + ':'
			+ d.getSeconds()
			);
}
// 顯示當前的日期/時間 格式：民國?年?月?日 ?時?分?秒
function writeNowC(){
	var d = new Date();
	document.write('民國' + ( d.getFullYear() - 1911 ) + '年'
			+ ( d.getMonth() + 1 ) + '月'
			+ d.getDate() + '日 '
			+ d.getHours() + '時'
			+ d.getMinutes() + '分'
			+ d.getSeconds() + '秒'
			);
}
// 檢查某個字串的每個字元是否都是英數文字
// 如： isAlphaNumber('rrr') 會回傳 true
// 如果提供第二個參數，則會被視為檢核的範圍
// 如： isAlphaNumber('rrr', 'abc') 會回傳 false
function isAlphaNumber(){

	var test = isAlphaNumber.arguments[0];

	var range = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
	if(isAlphaNumber.arguments.length==2)
		range = isAlphaNumber.arguments[1];
	for(var i=0; i<test.length; i++){
		if(range.indexOf(test.charAt(i))<0)
		return false;
		}
	return true;
}

function isAvailable(){

	var test = isAvailable.arguments[0];

	var range = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890:+-/()?., '";
	var range2 = " -/";
	
	if(range2.indexOf(test.charAt(0))>-1)
	return false;
	
	for(var i=0; i<test.length; i++)
	{
		if(range.indexOf(test.charAt(i))<0)
		return false;
	}
	return true;
}

function isAvailable2(){

	var test = isAvailable2.arguments[0];

	var range = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890:+-/()?., '";
	var range2 = " -/";
	
	if(range2.indexOf(test.charAt(0))>-1)
	return 0;
	for(var i=0; i<test.length; i++)
	{
		if(range.indexOf(test.charAt(i))<0)
		return i;
	}
	return -1;
}

function selectWord(start,length) {  // select text 
      if ( document.selection ) {   
        var range = document.selection.createRange();   
        range.moveStart( 'character', start);   
        range.moveEnd( 'character', length );   
        range.select();   
       }   
}   

function isAvailable3(){

	var test = isAvailable3.arguments[0];

	var range = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890:+-/()?., '";
	var range2 = " -/";
	var err="";
	if(range2.indexOf(test.charAt(0))>-1)
	return test.charAt(0);
	for(var i=0; i<test.length; i++)
	{
		if(range.indexOf(test.charAt(i))<0)
		{
			return test.charAt(i);
		}
	}
	return "";
}
function selectWord2(text) {   
      if ( document.selection ) {   
        var range = document.selection.createRange();   
        range.findText(text);
        range.select();   
       }   
}   

function isPhoneNumber(){

	var test = isPhoneNumber.arguments[0];

	var range = '`1234567890-=\][;/\'.,~!@#$%^&*()_+|\}\{\":?><';

	for(var i=0; i<test.length; i++){
		if(test.charAt(i)==' ' || test.charAt(i)=='　'){
		 return false;
		}
	}
	for(var i=0; i<test.length; i++){
		if(range.indexOf(test.charAt(i)) < 0){
		 return false;
		}
	}
	return true;
}
// 檢查字串是否符合密碼的規則
function isPassword(src){
	if(src.length!=8)
		return false;
	if(!isAlphaNumber(src))
		return false;
	return true;
}

function isOTPPassword(src)
{
	if(src.length!=8)
		return false;

	if(!isAlphaNumber(src,'1234567890'))
		return false;

	return true;
}

// 檢查字串是否符合暱稱的規則
function isNickname(src){
	if(src.length<1)
		return false;
	if(src.length>10)
		return false;
	if(!isAlphaNumber(src))
		return false;
	return true;
}
function isNicknameForFirstTime(src){
	if(src.length>10)
		return false;
	if(!isAlphaNumber(src, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 '))
		return false;
	return true;
}

// 將字串兩頭的空白字元包括' '、'\t'、'\n'去掉
// 如： trimString(' rrr') 會回傳 'rrr'
// 如果提供第二個參數，則會被視為檢核的範圍
// 如： trimString('rrrt ', 'r') 會回傳 't'
function trimString(){
	var bi = 0;
	var theSpace = ' \t\n　';
	var source = trimString.arguments[0];
	if(trimString.arguments.length==2)
		theSpace = trimString.arguments[1];
	while(theSpace.indexOf(source.charAt(bi)) >= 0 && bi < source.length)
		bi++;
	source = source.substring(bi);
	bi = source.length - 1;
	while(theSpace.indexOf(source.charAt(bi)) >= 0 && bi > 0)
		bi--;
	return source.substring(0, bi+1);
}
// 檢核指定的欄位是否為數字，如果有輸入上下限的話，檢核金額是否在範圍內
// 範例：isFieldNumber(document.forms[0].amt, 0, 20000) 會檢核amt這個欄位是否為數字且值在0和20000之間
function isFieldNumber(){
	var theField = isFieldNumber.arguments[0];
	if(trimString(theField.value).length <= 0)
		return false;
	if(isNaN(theField.value))
		return false;
	theField = isFieldNumber.arguments[0].value * 1.0;
	var theLowerLimit = null;
	var theUpperLimit = null;
	if(isFieldNumber.arguments.length == 3){
		theLowerLimit = isFieldNumber.arguments[1]*1.0;
		theUpperLimit = isFieldNumber.arguments[2]*1.0;
		if(!(theField >= theLowerLimit && theField <= theUpperLimit))
			return false;
	}
/*
	if(isFieldNumber.arguments.length == 2){
		if ( document.forms[0].AMT.value == '.0') {
			alert("AMT==0");
			return false;
			}
		theField      = isFieldNumber.arguments[0]*1.0;
		alert(isFieldNumber.arguments[0]);
		theLowerLimit = isFieldNumber.arguments[1]*1.0;
		if (theField.value <= theLowerLimit.value) 	return false;
	}
*/
	return true;
}

// 取得固定位數的小數，並作四捨五入 
function formatDecimal_new(){
    var src = formatDecimal.arguments[0]; //取第一個參數  ex 23.998675
    var dp = 2;
    if(formatDecimal.arguments.length > 1)
        dp = formatDecimal.arguments[1];
    if(dp<0)
        dp = 2;
    var isNegative = (src * 1.0 < 0);
    if ( (src < 1 && src > 0) || (src > -1 && src < 0) ) //if src= 0.123456 or -0.98657
    {
        src = '' + Math.round(Math.abs(src) * Math.pow(10, dp));  //ex.12.3456=>12 or 98.657=>99 0.01723=>0.02
        if(src.length<=dp) //
        {
            for (var i=0;i<(dp-src.length);i++)
            {
                src='0'+src;
            }
            src = '0.'+src;            //ex.0.12 or 0.99
        }
        else
        {  //0.999 => 1.00 因為進位變整數
            src = '1.00';
        }
    }
    else
    {
        //if src=12.3432 or -98.657
        src = '' + Math.round(Math.abs(src) * Math.pow(10, dp));      //ex.1234.32=>1234 or 9865.7=>9866
        if(dp > 0)
            src = src.substring(0, src.length - dp) + '.' + src.substring(src.length-dp);          //ex.12.34 or 98.66
    }
    if(isNegative)
        src = '-' + src;
    if (src == '.0')
        src='0.00';
    return src;
}

// 取得固定位數的小數，並作四捨五入
function formatDecimal(){
	var src = formatDecimal.arguments[0];
	var dp = 2;
	if(formatDecimal.arguments.length > 1)
		dp = formatDecimal.arguments[1];
	if(dp<0)
		dp = 2;
	var isNegative = (src * 1.0 < 0);
	src = '' + Math.round(Math.abs(src) * Math.pow(10, dp));
	
	if ( src.length < dp ) {
		src = src / Math.pow(10,dp);
//		alert('Before Substring src is -' + src + '-' );
		src = '' + src ;
		src = src.substring(1);
//		alert('After Substring src is -' + src + '-' );
		return src ;	
	}
	
	if(dp > 0)
		src = src.substring(0, src.length - dp) + '.' + src.substring(src.length-dp);
	if(isNegative)
		src = '-' + src;
	return src;
}



// Cheeven 的 DHTML lib
// 取得目前瀏覽器的種類
function getBrowser(){
	if(navigator.appName=='Netscape'){
		if(parseInt(navigator.appVersion) < 5)
			if(parseInt(navigator.appVersion) < 4)
				return "NN3"
			else
				return "NN4";
			return "NN6";
	} else if (navigator.appName=='Microsoft Internet Explorer'){
		if(parseInt(navigator.appVersion) < 5)
			if(parseInt(navigator.appVersion) < 4)
				return "IE3"
			else
				return "IE4";
		else
			return "IE5";
	} else {
		return "unknown browser";
	}
}
// 取得某個名稱的單元(這個function只能用在單層的dhtml)
function getDIV(name){
	var bs = getBrowser();
	if(bs == "NN4")
		// Netscape 的層疊
		return document.layers[name];

	else if(bs == "IE4" || bs == "IE5")
		// Microsoft Internet Explorer 的 Dynamic HTML
		if(eval('document.all.' + name))
			return eval('document.all.' + name + '.style');
		else
			return null;

	else
		// W3C 的 DOM 標準
		if(document.getElementById(name))
			return document.getElementById(name).style;
		else
			return null;
}
function showDIV(name){
	var div = getDIV(name);
	if(getBrowser() == "NN4")
		v = 'show';
	else
		v = 'visible';
	div.visibility = v;
}
function hideDIV(name){
	var div = getDIV(name);
	if(getBrowser() == "NN4")
		v = 'hide';
	else	
		v = 'hidden';
	div.visibility = v;
}

// 指定最上層框架的url位置
function takeOverTop(target){ 
	var topdoc = getEscapeBracket(top.location.href);	
	var host = topdoc.substring(0, topdoc.indexOf('/', topdoc.indexOf('://')+3));  
	var doclink = topdoc.substring(topdoc.indexOf('/', topdoc.indexOf('://')+3));
    
	if(doclink != target)
		top.location.href = this.filterReplaceURL(host + getEscapeBracket(target));		
}

/**
 * 處理 Fortify 的檢核。
 * 
 * sURL ---------- 被過濾的 URL。
 */
function filterReplaceURL(sURL) 
{
   var srcURL = sURL;
   var rule="^[0-9a-zA-Z\\/_\\.-]";
   if (!sURL.match(rule))
      sURL=srcURL;

   return sURL;
}

// for xss by you 20100802
function getEscapeBracket(srcStr) {

  srcStrBak = srcStr;    
  try {
    while (srcStr.indexOf("<")>-1) {
      srcStr = srcStr.replace("<","&lt");
    }    
    while (srcStr.indexOf(">")>-1) {
      srcStr = srcStr.replace(">","&gt");
    }
  } catch (err) {  
    return srcStrBak;
  }  
  return srcStr;
}

// add 2000/12/5 cookie.js
// var today = new Date();
// var expiry = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

function getCookieVal (offset) {
	var endstr = document.cookie.indexOf (";", offset);
	if (endstr == -1) { endstr = document.cookie.length; }
	return unescape(document.cookie.substring(offset, endstr));
	}

function GetCookie (name) {
    var pattern = new RegExp('(?:^|; )' + name + '=([^;]*)');
    var matches = document.cookie.match(pattern);
    return matches ? decodeURIComponent(matches[1]) : null; 
}

function DeleteCookie (name,path,domain) {
	if (GetCookie(name)) {
		document.cookie = name + "=" +
		((path) ? "; path=" + path : "") +
		((domain) ? "; domain=" + domain : "") +
		"; expires=Thu, 01-Jan-70 00:00:01 GMT";
		}
	}

function SetCookie (name,value,expires,path,domain,secure) {
  document.cookie = name + "=" + escape (value) +
    ((expires) ? "; expires=" + expires.toGMTString() : "") +
    ((path) ? "; path=" + path : "") +
    ((domain) ? "; domain=" + domain : "") +
    ((secure) ? "; secure" : "");
	}

// add 2000/12/5  cookie.js

// check USERID and company ID
//身份證字號TokenCheck
function TokenCheck_PersonUserID(value){
  var personUserIDToken=/^[A-Z]\d{9}$/;
  return personUserIDToken.test(value);
}

//統一編號＋2位授權碼TokenCheck
function TokenCheck_CompanyUserID(value){
  var companyUserIDToken=/^\d{10}$/;
  return companyUserIDToken.test(value);
}

//密碼TokenCheck
function TokenCheck_Passwd(value){
  var passwdToken=/^[a-zA-Z0-9]{8,8}$/;
  return passwdToken.test(value);
}

//身份證字號規則檢查
//例: Y  2  2  0  3  0  8  4  2  9 
//  *    8  7  6  5  4  3  2  1  1
//----------------------------------
//      16+14+0 +15 +0+24 +8 +2 +9 = 88
// Y = 12
// 88 + 12 = 100
// 100 % 10 = 0 <--正確
function RuleCheck_PersonUserID(value){
  var letterStr ='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var refArray = ['1' ,'10','19','28','37','46','55','64',
                  '39','73','82','2' ,'11','20','48','29',
                  '38','47','56','65','74','83','21','3' ,
                  '12','30'];
  var weightStr = '876543211'; //加權數值字串
  var checkStr  = value.substring(1);
  var sum = 0;
  
  if(value.length != 10)
    return false;
  
  for (i=0;i<9;i++){
    sum += checkStr.charAt(i) * weightStr.charAt(i);
  }
  
  sum += (1 * refArray[letterStr.indexOf(value.charAt(0))]);//為了避免便成字串相加,故先乘上1
  if((sum % 10) != 0)
    return false;

  return true;
}


//統一編號規則檢查
function RuleCheck_CompanyUserID(value){
  var companyNo = value.substring(0,8);  //統一編號
  var weightStr = '12121241'; //加權數值字串
  var sum = 0;
  for (i=0;i<7;i+=2){
    if (i==6)  {i=7;}
    sum = sum + companyNo.charAt(i) * weightStr.charAt(i);
  }
  var tempNum,tempStr;
  for (j=1;j<8;j+=2){
    if (j==7)  {j=6;}
    tempNum = companyNo.charAt(j) * weightStr.charAt(j);
    tempStr = '00' + tempNum;
    tempStr = tempStr.substring(tempStr.length-3,tempStr.length);
    sum = sum + parseInt(tempStr.substring(0,2)) + tempStr.charAt(2)*1;
  //alert('j='+j+'tempStr='+tempStr+'sum='+sum);
  }
  if ((sum%10)!=0){
    return false;
  }
  return true;
}


// 以下是Dream Weaver的函式庫，請勿修改
function MM_reloadPage(init) {  //reloads the window if Nav4 resized
  if (init==true) with (navigator) {if ((appName=="Netscape")&&(parseInt(appVersion)==4)) {
    document.MM_pgW=innerWidth; document.MM_pgH=innerHeight; onresize=MM_reloadPage; }}
  else if (innerWidth!=document.MM_pgW || innerHeight!=document.MM_pgH) location.reload();
}

function MM_showHideLayers() { //v3.0
  var i,p,v,obj,args=MM_showHideLayers.arguments;
  for (i=0; i<(args.length-2); i+=3) if ((obj=MM_findObj(args[i]))!=null) { v=args[i+2];
    if (obj.style) { obj=obj.style; v=(v=='show')?'visible':(v='hide')?'hidden':v; }
    obj.visibility=v; }
}

function MM_swapImgRestore() { //v3.0
  var i,x,a=document.MM_sr; for(i=0;a&&i<a.length&&(x=a[i])&&x.oSrc;i++) x.src=x.oSrc;
}

function MM_swapImage() { //v3.0
  var i,j=0,x,a=MM_swapImage.arguments; document.MM_sr=new Array(); for(i=0;i<(a.length-2);i+=3)
   if ((x=MM_findObj(a[i]))!=null){document.MM_sr[j++]=x; if(!x.oSrc) x.oSrc=x.src; x.src=a[i+2];}
}

function MM_findObj(n, d) { //v4.0
  var p,i,x;  if(!d) d=document; if((p=n.indexOf("?"))>0&&parent.frames.length) {
    d=parent.frames[n.substring(p+1)].document; n=n.substring(0,p);}
  if(!(x=d[n])&&d.all) x=d.all[n]; for (i=0;!x&&i<d.forms.length;i++) x=d.forms[i][n];
  for(i=0;!x&&d.layers&&i<d.layers.length;i++) x=MM_findObj(n,d.layers[i].document);
  if(!x && document.getElementById) x=document.getElementById(n); return x;
}

function MM_preloadImages() { //v3.0
  var d=document; if(d.images){ if(!d.MM_p) d.MM_p=new Array();
    var i,j=d.MM_p.length,a=MM_preloadImages.arguments; for(i=0; i<a.length; i++)
    if (a[i].indexOf("#")!=0){ d.MM_p[j]=new Image; d.MM_p[j++].src=a[i];}}
}

function MM_nbGroup(event, grpName) { //v3.0
  var i,img,nbArr,args=MM_nbGroup.arguments;
  if (event == "init" && args.length > 2) {
    if ((img = MM_findObj(args[2])) != null && !img.MM_init) {
      img.MM_init = true; img.MM_up = args[3]; img.MM_dn = img.src;
      if ((nbArr = document[grpName]) == null) nbArr = document[grpName] = new Array();
      nbArr[nbArr.length] = img;
      for (i=4; i < args.length-1; i+=2) if ((img = MM_findObj(args[i])) != null) {
        if (!img.MM_up) img.MM_up = img.src;
        img.src = img.MM_dn = args[i+1];
        nbArr[nbArr.length] = img;
    } }
  } else if (event == "over") {
    document.MM_nbOver = nbArr = new Array();
    for (i=1; i < args.length-1; i+=3) if ((img = MM_findObj(args[i])) != null) {
      if (!img.MM_up) img.MM_up = img.src;
      img.src = (img.MM_dn && args[i+2]) ? args[i+2] : args[i+1];
      nbArr[nbArr.length] = img;
    }
  } else if (event == "out" ) {
    for (i=0; i < document.MM_nbOver.length; i++) {
      img = document.MM_nbOver[i]; img.src = (img.MM_dn) ? img.MM_dn : img.MM_up; }
  } else if (event == "down") {
    if ((nbArr = document[grpName]) != null)
      for (i=0; i < nbArr.length; i++) { img=nbArr[i]; img.src = img.MM_up; img.MM_dn = 0; }
    document[grpName] = nbArr = new Array();
    for (i=2; i < args.length-1; i+=2) if ((img = MM_findObj(args[i])) != null) {
      if (!img.MM_up) img.MM_up = img.src;
      img.src = img.MM_dn = args[i+1];
      nbArr[nbArr.length] = img;
  } }
}
var cwin=null;

function MM_openBrWindow(theURL,winName,features) { //v2.0
  if(cwin==null || cwin.closed)
  	cwin = window.open(theURL,winName,features);
  else
  	cwin.location.href = theURL;
}

//稽徵機關(下拉式動態選單)
function update_zip(Name, nForm)
{
	nForm.length = 0;
	nForm.options[0] = new Option("請選擇","");
	
	switch( Name ){
		
	  case "基隆市":
		nForm.options[1] = new Option( "七堵區121" , "121" );
		nForm.options[2] = new Option( "中山區112" , "112" );
		nForm.options[3] = new Option( "中正區116" , "116" );
		nForm.options[4] = new Option( "仁愛區111" , "111" );
		nForm.options[5] = new Option( "安樂區113" , "113" );
		nForm.options[6] = new Option( "信義區117" , "117" );
		nForm.options[7] = new Option( "暖暖區122" , "122" );
      	break;  	
  	
    case "台北市":
		nForm.options[1] = new Option( "士林區013" , "013" );
		nForm.options[2] = new Option( "大同區004" , "004" );
		nForm.options[3] = new Option( "大安區011" , "011" );
		nForm.options[4] = new Option( "中北區005" , "005" );
		nForm.options[5] = new Option( "中正區007" , "007" );
		nForm.options[6] = new Option( "中南區012" , "012" );
		nForm.options[7] = new Option( "內湖區014" , "014" );
		nForm.options[8] = new Option( "文山區010" , "010" );
		nForm.options[9] = new Option( "北投區002" , "002" );
		nForm.options[10] = new Option( "松山區008" , "008" );
		nForm.options[11] = new Option( "信義區001" , "001" );
		nForm.options[12] = new Option( "南港區009" , "009" );
		nForm.options[13] = new Option( "萬華區006" , "006" );    
      	break; 
        	
    case "新北市":
		nForm.options[1] = new Option( "八里區263" , "263" );
		nForm.options[2] = new Option( "三芝區261" , "261" );
		nForm.options[3] = new Option( "三重區257" , "257" );
		nForm.options[4] = new Option( "三峽區252" , "252" );
		nForm.options[5] = new Option( "土城區255" , "255" );
		nForm.options[6] = new Option( "中和區274" , "274" );
		nForm.options[7] = new Option( "五股區278" , "278" );
		nForm.options[8] = new Option( "平溪區270" , "270" );
		nForm.options[9] = new Option( "永和區275" , "275" );
		nForm.options[10] = new Option( "石門區262" , "262" );
		nForm.options[11] = new Option( "石碇區265" , "265" );
		nForm.options[12] = new Option( "汐止區281" , "281" );
		nForm.options[13] = new Option( "坪林區267" , "267" );
		nForm.options[14] = new Option( "林口區277" , "277" );
		nForm.options[15] = new Option( "板橋區251" , "251" );
		nForm.options[16] = new Option( "金山區258" , "258" );
		nForm.options[17] = new Option( "泰山區279" , "279" );
		nForm.options[18] = new Option( "烏來區268" , "268" );
		nForm.options[19] = new Option( "貢寮區272" , "272" );
		nForm.options[20] = new Option( "淡水區260" , "260" );
		nForm.options[21] = new Option( "深坑區266" , "266" );
		nForm.options[22] = new Option( "新店區264" , "264" );
		nForm.options[23] = new Option( "新莊區276" , "276" );
		nForm.options[24] = new Option( "瑞芳區269" , "269" );
		nForm.options[25] = new Option( "萬里區259" , "259" );
		nForm.options[26] = new Option( "樹林區254" , "254" );
		nForm.options[27] = new Option( "雙溪區271" , "271" );
		nForm.options[28] = new Option( "蘆洲區256" , "256" );
		nForm.options[29] = new Option( "鶯歌區251" , "253" );        
		break;
      
    case "桃園市":
		nForm.options[1] = new Option( "八德區358" , "358" );
		nForm.options[2] = new Option( "大園區371" , "371" );
		nForm.options[3] = new Option( "大溪區362" , "362" );
		nForm.options[4] = new Option( "中壢區359" , "359" );
		nForm.options[5] = new Option( "平鎮區360" , "360" );
		nForm.options[6] = new Option( "桃園區354" , "354" );
		nForm.options[7] = new Option( "復興區364" , "364" );
		nForm.options[8] = new Option( "新屋區353" , "353" );
		nForm.options[9] = new Option( "楊梅區352" , "352" );
		nForm.options[10] = new Option( "龍潭區363" , "363" );
		nForm.options[11] = new Option( "龜山區357" , "357" );
		nForm.options[12] = new Option( "蘆竹區370" , "370" );
		nForm.options[13] = new Option( "觀音區361" , "361" );
		nForm.options[14] = new Option( "桃園市372" , "372" );      
		break;



    case "新竹市":
		nForm.options[2] = new Option("北區602", "602");
		nForm.options[1] = new Option("東區601", "601");
		nForm.options[3] = new Option("香山區605", "605");
		break;

    case "新竹縣":
		nForm.options[1] = new Option( "五峰鄉403" , "403" );
		nForm.options[2] = new Option( "北埔鄉400" , "400" );
		nForm.options[3] = new Option( "尖石鄉402" , "402" );
		nForm.options[4] = new Option( "竹北市393" , "393" );
		nForm.options[5] = new Option( "竹東鎮396" , "396" );
		nForm.options[6] = new Option( "芎林鄉398" , "398" );
		nForm.options[7] = new Option( "峨眉鄉401" , "401" );
		nForm.options[8] = new Option( "湖口鄉394" , "394" );
		nForm.options[9] = new Option( "新埔鎮392" , "392" );
		nForm.options[10] = new Option( "新豐鄉395" , "395" );
		nForm.options[11] = new Option( "橫山鄉397" , "397" );
		nForm.options[12] = new Option( "關西鎮391" , "391" );
		nForm.options[13] = new Option( "寶山鄉399" , "399" );      
		break;

    case "苗栗縣":
		nForm.options[1] = new Option( "三義鄉426" , "426" );
		nForm.options[2] = new Option( "三灣鄉437" , "437" );
		nForm.options[3] = new Option( "大湖鄉430" , "430" );
		nForm.options[4] = new Option( "公館鄉424" , "424" );
		nForm.options[5] = new Option( "竹南鎮434" , "434" );
		nForm.options[6] = new Option( "西湖鄉427" , "427" );
		nForm.options[7] = new Option( "卓蘭鎮431" , "431" );
		nForm.options[8] = new Option( "南庄鄉438" , "438" );
		nForm.options[9] = new Option( "後龍鎮429" , "429" );
		nForm.options[10] = new Option( "苗栗市421" , "421" );
		nForm.options[11] = new Option( "苑裡鎮422" , "422" );
		nForm.options[12] = new Option( "泰安鄉433" , "433" );
		nForm.options[13] = new Option( "通霄鎮423" , "423" );
		nForm.options[14] = new Option( "造橋鄉436" , "436" );
		nForm.options[15] = new Option( "獅潭鄉432" , "432" );
		nForm.options[16] = new Option( "銅鑼鄉425" , "425" );
		nForm.options[17] = new Option( "頭份鎮435" , "435" );
		nForm.options[18] = new Option( "頭屋鄉428" , "428" );      
		break;

    case "台中市": // new merged city
		nForm.options[1] = new Option( "中區083" , "083" );
		nForm.options[2] = new Option( "北屯區082" , "082" );
		nForm.options[3] = new Option( "北區085" , "085" );
		nForm.options[4] = new Option( "西屯區086" , "086" );
		nForm.options[5] = new Option( "西區084" , "084" );
		nForm.options[6] = new Option( "東區088" , "088" );
		nForm.options[7] = new Option( "南屯區087" , "087" );
		nForm.options[8] = new Option( "南區089" , "089" );
		nForm.options[9] = new Option( "大甲區491" , "491" );
		nForm.options[10] = new Option( "大安區496" , "496" );
		nForm.options[11] = new Option( "大肚區497" , "497" );
		nForm.options[12] = new Option( "大里區502" , "502" );
		nForm.options[13] = new Option( "大雅區489" , "489" );
		nForm.options[14] = new Option( "太平區501" , "501" );
		nForm.options[15] = new Option( "外埔區495" , "495" );
		nForm.options[16] = new Option( "石岡區505" , "505" );
		nForm.options[17] = new Option( "后里區488" , "488" );
		nForm.options[18] = new Option( "沙鹿區493" , "493" );
		nForm.options[19] = new Option( "和平區506" , "506" );
		nForm.options[20] = new Option( "東勢區503" , "503" );
		nForm.options[21] = new Option( "烏日區499" , "499" );
		nForm.options[22] = new Option( "神岡區487" , "487" );
		nForm.options[23] = new Option( "梧棲區494" , "494" );
		nForm.options[24] = new Option( "清水區492" , "492" );
		nForm.options[25] = new Option( "新社區504" , "504" );
		nForm.options[26] = new Option( "潭子區490" , "490" );
		nForm.options[27] = new Option( "龍井區498" , "498" );
		nForm.options[28] = new Option( "豐原區486" , "486" );
		nForm.options[29] = new Option( "霧峰區500" , "500" );      
		break;

    case "彰化縣":
		nForm.options[1] = new Option( "二水鄉558" , "558" );
		nForm.options[2] = new Option( "二林鎮560" , "560" );
		nForm.options[3] = new Option( "大村鄉553" , "553" );
		nForm.options[4] = new Option( "大城鄉564" , "564" );
		nForm.options[5] = new Option( "北斗鎮559" , "559" );
		nForm.options[6] = new Option( "永靖鄉556" , "556" );
		nForm.options[7] = new Option( "田中鎮552" , "552" );
		nForm.options[8] = new Option( "田尾鄉561" , "561" );
		nForm.options[9] = new Option( "竹塘鄉565" , "565" );
		nForm.options[10] = new Option( "伸港鄉545" , "545" );
		nForm.options[11] = new Option( "秀水鄉547" , "547" );
		nForm.options[12] = new Option( "和美鎮543" , "543" );
		nForm.options[13] = new Option( "社頭鄉557" , "557" );
		nForm.options[14] = new Option( "芳苑鄉563" , "563" );
		nForm.options[15] = new Option( "花壇鄉548" , "548" );
		nForm.options[16] = new Option( "芬園鄉549" , "549" );
		nForm.options[17] = new Option( "員林鎮550" , "550" );
		nForm.options[18] = new Option( "埔心鄉555" , "555" );
		nForm.options[19] = new Option( "埔鹽鄉554" , "554" );
		nForm.options[20] = new Option( "埤頭鄉562" , "562" );
		nForm.options[21] = new Option( "鹿港鎮542" , "542" );
		nForm.options[22] = new Option( "溪州鄉566" , "566" );
		nForm.options[23] = new Option( "溪湖鎮551" , "551" );
		nForm.options[24] = new Option( "彰化市541" , "541" );
		nForm.options[25] = new Option( "福興鄉546" , "546" );
		nForm.options[26] = new Option( "線西鄉544" , "544" );      
		break;

    case "南投縣":
		nForm.options[1] = new Option( "中寮鄉515" , "515" );
		nForm.options[2] = new Option( "仁愛鄉521" , "521" );
		nForm.options[3] = new Option( "水里鄉516" , "516" );
		nForm.options[4] = new Option( "名間鄉514" , "514" );
		nForm.options[5] = new Option( "竹山鎮522" , "522" );
		nForm.options[6] = new Option( "信義鄉517" , "517" );
		nForm.options[7] = new Option( "南投市511" , "511" );
		nForm.options[8] = new Option( "埔里鎮518" , "518" );
		nForm.options[9] = new Option( "草屯鎮512" , "512" );
		nForm.options[10] = new Option( "國姓鄉520" , "520" );
		nForm.options[11] = new Option( "魚池鄉519" , "519" );
		nForm.options[12] = new Option( "鹿谷鄉523" , "523" );
		nForm.options[13] = new Option( "集集鎮513" , "513" );      
		break;

    case "雲林縣":
		nForm.options[1] = new Option( "二崙鄉625" , "625" );
		nForm.options[2] = new Option( "口湖鄉621" , "621" );
		nForm.options[3] = new Option( "土庫鎮624" , "624" );
		nForm.options[4] = new Option( "大埤鄉615" , "615" );
		nForm.options[5] = new Option( "元長鄉619" , "619" );
		nForm.options[6] = new Option( "斗六市611" , "611" );
		nForm.options[7] = new Option( "斗南鎮612" , "612" );
		nForm.options[8] = new Option( "水林鄉622" , "622" );
		nForm.options[9] = new Option( "北港鎮618" , "618" );
		nForm.options[10] = new Option( "古坑鄉614" , "614" );
		nForm.options[11] = new Option( "四湖鄉620" , "620" );
		nForm.options[12] = new Option( "西螺鎮613" , "613" );
		nForm.options[13] = new Option( "東勢鄉628" , "628" );
		nForm.options[14] = new Option( "林內鄉617" , "617" );
		nForm.options[15] = new Option( "虎尾鎮623" , "623" );
		nForm.options[16] = new Option( "崙背鄉626" , "626" );
		nForm.options[17] = new Option( "麥寮鄉627" , "627" );
		nForm.options[18] = new Option( "莿桐鄉616" , "616" );
		nForm.options[19] = new Option( "臺西鄉630" , "630" );
		nForm.options[20] = new Option( "褒忠鄉629" , "629" );
		break;

    case "嘉義市":
		nForm.options[1] = new Option( "西區382" , "382" );
		nForm.options[2] = new Option( "東區381" , "381" );      
		break;
		
    case "嘉義縣":
		nForm.options[1] = new Option( "大林鎮664" , "664" );
		nForm.options[2] = new Option( "大埔鄉662" , "662" );
		nForm.options[3] = new Option( "中埔鄉660" , "660" );
		nForm.options[4] = new Option( "六腳鄉654" , "654" );
		nForm.options[5] = new Option( "太保市658" , "658" );
		nForm.options[6] = new Option( "水上鄉659" , "659" );
		nForm.options[7] = new Option( "布袋鎮652" , "652" );
		nForm.options[8] = new Option( "民雄鄉665" , "665" );
		nForm.options[9] = new Option( "朴子市651" , "651" );
		nForm.options[10] = new Option( "竹崎鄉667" , "667" );
		nForm.options[11] = new Option( "東石鄉655" , "655" );
		nForm.options[12] = new Option( "阿里山鄉663" , "663" );
		nForm.options[13] = new Option( "梅山鄉668" , "668" );
		nForm.options[14] = new Option( "鹿草鄉657" , "657" );
		nForm.options[15] = new Option( "番路鄉661" , "661" );
		nForm.options[16] = new Option( "新港鄉653" , "653" );
		nForm.options[17] = new Option( "溪口鄉666" , "666" );
		nForm.options[18] = new Option( "義竹鄉656" , "656" );
		break;

    case "台南市": // new merged city
		nForm.options[1] = new Option( "中西區152" , "152" );
		nForm.options[2] = new Option( "北區145" , "145" );
		nForm.options[3] = new Option( "安平區147" , "147" );
		nForm.options[4] = new Option( "安南區148" , "148" );
		//nForm.options[5] = new Option( "西區145" , "145" );
		nForm.options[5] = new Option( "東區142" , "142" );
		nForm.options[6] = new Option( "南區143" , "143" );
		nForm.options[7] = new Option( "七股區751" , "751" );
		nForm.options[8] = new Option( "下營區731" , "731" );
		nForm.options[9] = new Option( "大內區734" , "734" );
		nForm.options[10] = new Option( "山上區738" , "738" );
		nForm.options[11] = new Option( "仁德區743" , "743" );
		nForm.options[12] = new Option( "六甲區732" , "732" );
		nForm.options[13] = new Option( "北門區753" , "753" );
		nForm.options[14] = new Option( "左鎮區742" , "742" );
		nForm.options[15] = new Option( "永康區747" , "747" );
		nForm.options[16] = new Option( "玉井區739" , "739" );
		nForm.options[17] = new Option( "白河區727" , "727" );
		nForm.options[18] = new Option( "安定區755" , "755" );
		nForm.options[19] = new Option( "西港區750" , "750" );
		nForm.options[20] = new Option( "佳里區749" , "749" );
		nForm.options[21] = new Option( "官田區733" , "733" );
		nForm.options[22] = new Option( "東山區730" , "730" );
		nForm.options[23] = new Option( "南化區741" , "741" );
		nForm.options[24] = new Option( "後壁區729" , "729" );
		nForm.options[25] = new Option( "柳營區728" , "728" );
		nForm.options[26] = new Option( "將軍區752" , "752" );
		nForm.options[27] = new Option( "麻豆區748" , "748" );
		nForm.options[28] = new Option( "善化區735" , "735" );
		nForm.options[29] = new Option( "新化區736" , "736" );
		nForm.options[30] = new Option( "新市區737" , "737" );
		nForm.options[31] = new Option( "新營區725" , "725" );
		nForm.options[32] = new Option( "楠西區740" , "740" );
		nForm.options[33] = new Option( "學甲區754" , "754" );
		nForm.options[34] = new Option( "龍崎區746" , "746" );
		nForm.options[35] = new Option( "歸仁區744" , "744" );
		nForm.options[36] = new Option( "關廟區745" , "745" );
		nForm.options[37] = new Option( "鹽水區726" , "726" );
		break;

    case "高雄市": // new merged city
		nForm.options[1] = new Option( "三民區180" , "180" );
		nForm.options[2] = new Option( "小港區181" , "181" );
		nForm.options[3] = new Option( "左營區182" , "182" );
		nForm.options[4] = new Option( "前金區173" , "173" );
		nForm.options[5] = new Option( "前鎮區178" , "178" );
		nForm.options[6] = new Option( "苓雅區174" , "174" );
		nForm.options[7] = new Option( "新興區172" , "172" );
		nForm.options[8] = new Option( "楠梓區177" , "177" );
		nForm.options[9] = new Option( "鼓山區176" , "176" );
		nForm.options[10] = new Option( "旗津區176" , "176" );
		nForm.options[11] = new Option( "鹽埕區173" , "173" );
		nForm.options[12] = new Option( "那瑪夏區819" , "819" );
		nForm.options[13] = new Option( "大社區818" , "818" );
		nForm.options[14] = new Option( "大寮區818" , "818" );
		nForm.options[15] = new Option( "大樹區818" , "818" );
		nForm.options[16] = new Option( "仁武區818" , "818" );
		nForm.options[17] = new Option( "內門區819" , "819" );
		nForm.options[18] = new Option( "六龜區819" , "819" );
		nForm.options[19] = new Option( "永安區820" , "820" );
		nForm.options[20] = new Option( "田寮區820" , "820" );
		nForm.options[21] = new Option( "甲仙區819" , "819" );
		nForm.options[22] = new Option( "杉林區819" , "819" );
		nForm.options[23] = new Option( "岡山區820" , "820" );
		nForm.options[24] = new Option( "林園區818" , "818" );
		nForm.options[25] = new Option( "阿蓮區820" , "820" );
		nForm.options[26] = new Option( "美濃區819" , "819" );
		nForm.options[27] = new Option( "茄萣區820" , "820" );
		nForm.options[28] = new Option( "茂林區819" , "819" );
		nForm.options[29] = new Option( "桃源區819" , "819" );
		nForm.options[30] = new Option( "梓官區820" , "820" );
		nForm.options[31] = new Option( "鳥松區818" , "818" );
		nForm.options[32] = new Option( "湖內區820" , "820" );
		nForm.options[33] = new Option( "路竹區820" , "820" );
		nForm.options[34] = new Option( "旗山區819" , "819" );
		nForm.options[35] = new Option( "鳳山區818" , "818" );
		nForm.options[36] = new Option( "橋頭區820" , "820" );
		nForm.options[37] = new Option( "燕巢區820" , "820" );
		nForm.options[38] = new Option( "彌陀區820" , "820" );        
		break;

    case "屏東縣":
		nForm.options[1] = new Option( "九如鄉825" , "825" );
		nForm.options[2] = new Option( "三地門鄉829" , "829" );
		nForm.options[3] = new Option( "內埔鄉841" , "841" );
		nForm.options[4] = new Option( "竹田鄉842" , "842" );
		nForm.options[5] = new Option( "牡丹鄉853" , "853" );
		nForm.options[6] = new Option( "車城鄉849" , "849" );
		nForm.options[7] = new Option( "里港鄉826" , "826" );
		nForm.options[8] = new Option( "佳冬鄉837" , "837" );
		nForm.options[9] = new Option( "來義鄉846" , "846" );
		nForm.options[10] = new Option( "枋山鄉851" , "851" );
		nForm.options[11] = new Option( "枋寮鄉844" , "844" );
		nForm.options[12] = new Option( "東港鎮832" , "832" );
		nForm.options[13] = new Option( "林邊鄉835" , "835" );
		nForm.options[14] = new Option( "長治鄉823" , "823" );
		nForm.options[15] = new Option( "南州鄉836" , "836" );
		nForm.options[16] = new Option( "屏東市821" , "821" );
		nForm.options[17] = new Option( "恆春鎮848" , "848" );
		nForm.options[18] = new Option( "春日鄉847" , "847" );
		nForm.options[19] = new Option( "崁頂鄉834" , "834" );
		nForm.options[20] = new Option( "泰武鄉845" , "845" );
		nForm.options[21] = new Option( "琉球鄉838" , "838" );
		nForm.options[22] = new Option( "高樹鄉828" , "828" );
		nForm.options[23] = new Option( "新埤鄉843" , "843" );
		nForm.options[24] = new Option( "新園鄉833" , "833" );
		nForm.options[25] = new Option( "獅子鄉852" , "852" );
		nForm.options[26] = new Option( "萬丹鄉822" , "822" );
		nForm.options[27] = new Option( "萬巒鄉840" , "840" );
		nForm.options[28] = new Option( "滿州鄉850" , "850" );
		nForm.options[29] = new Option( "瑪家鄉831" , "831" );
		nForm.options[30] = new Option( "潮州鎮839" , "839" );
		nForm.options[31] = new Option( "霧台鄉830" , "830" );
		nForm.options[32] = new Option( "麟洛鄉824" , "824" );
		nForm.options[33] = new Option( "鹽埔鄉827" , "827" );
		break;
      
    case "宜蘭縣":
		nForm.options[1] = new Option( "三星鄉330" , "330" );
		nForm.options[2] = new Option( "大同鄉331" , "331" );
		nForm.options[3] = new Option( "五結鄉327" , "327" );
		nForm.options[4] = new Option( "冬山鄉328" , "328" );
		nForm.options[5] = new Option( "壯圍鄉324" , "324" );
		nForm.options[6] = new Option( "宜蘭市321" , "321" );
		nForm.options[7] = new Option( "南澳鄉332" , "332" );
		nForm.options[8] = new Option( "員山鄉325" , "325" );
		nForm.options[9] = new Option( "頭城鎮322" , "322" );
		nForm.options[10] = new Option( "礁溪鄉323" , "323" );
		nForm.options[11] = new Option( "羅東鎮326" , "326" );
		nForm.options[12] = new Option( "蘇澳鎮329" , "329" );      
		break;
		
    case "花蓮縣":
		nForm.options[1] = new Option( "玉里鎮900" , "900" );
		nForm.options[2] = new Option( "光復鄉892" , "892" );
		nForm.options[3] = new Option( "吉安鄉894" , "894" );
		nForm.options[4] = new Option( "秀林鄉898" , "898" );
		nForm.options[5] = new Option( "卓溪鄉903" , "903" );
		nForm.options[6] = new Option( "花蓮市891" , "891" );
		nForm.options[7] = new Option( "富里鄉902" , "902" );
		nForm.options[8] = new Option( "新城鄉893" , "893" );
		nForm.options[9] = new Option( "瑞穗鄉901" , "901" );
		nForm.options[10] = new Option( "萬榮鄉899" , "899" );
		nForm.options[11] = new Option( "壽豐鄉895" , "895" );
		nForm.options[12] = new Option( "鳳林鎮896" , "896" );
		nForm.options[13] = new Option( "豐濱鄉897" , "897" );
		break;

    case "台東縣":
		nForm.options[1] = new Option( "大武鄉925" , "925" );
		nForm.options[2] = new Option( "太麻里鄉926" , "926" );
		nForm.options[3] = new Option( "台東市921" , "921" );
		nForm.options[4] = new Option( "成功鎮922" , "922" );
		nForm.options[5] = new Option( "池上鄉930" , "930" );
		nForm.options[6] = new Option( "卑南鄉924" , "924" );
		nForm.options[7] = new Option( "延平鄉932" , "932" );
		nForm.options[8] = new Option( "東河鄉927" , "927" );
		nForm.options[9] = new Option( "金峰鄉935" , "935" );
		nForm.options[10] = new Option( "長濱鄉928" , "928" );
		nForm.options[11] = new Option( "海端鄉933" , "933" );
		nForm.options[12] = new Option( "鹿野鄉929" , "929" );
		nForm.options[13] = new Option( "達仁鄉934" , "934" );
		nForm.options[14] = new Option( "綠島鄉931" , "931" );
		nForm.options[15] = new Option( "關山鎮923" , "923" );
		nForm.options[16] = new Option( "蘭嶼鄉936" , "936" );
		break;

    case "金門":
		nForm.options[1] = new Option( "金沙鎮955" , "955" );
		nForm.options[2] = new Option( "金城鎮952" , "952" );
		nForm.options[3] = new Option( "金湖鎮954" , "954" );
		nForm.options[4] = new Option( "金寧鄉953" , "953" );
		nForm.options[5] = new Option( "烈嶼鄉956" , "956" );
		nForm.options[6] = new Option( "烏坵鄉957" , "957" );
		break;
				
    case "澎湖縣":
		nForm.options[1] = new Option( "七美鄉976" , "976" );
		nForm.options[2] = new Option( "白沙鄉973" , "973" );
		nForm.options[3] = new Option( "西嶼鄉974" , "974" );
		nForm.options[4] = new Option( "馬公市971" , "971" );
		nForm.options[5] = new Option( "望安鄉975" , "975" );
		nForm.options[6] = new Option( "湖西鄉972" , "972" );
		break;

    case "馬祖":
		nForm.options[1] = new Option("連江縣稅處北竿鄉982", "982");
		nForm.options[2] = new Option("連江縣稅處東引鄉98", "98");
		nForm.options[3] = new Option("連江縣稅處南竿鄉981", "981");
		nForm.options[4] = new Option("連江縣稅處莒光鄉983", "983");
		break;
	}
}

//check 幣別與金額位數合法性
function checkMoney (amount, currency) {
	var fl = parseFloat(amount);
	var f = document.form1;

	if (currency=="JPY" || currency=="ITL" || currency=="BEF" || currency=="TWD" || currency=="VND")
	{		
		if (amount.indexOf('.') > -1)
		{
			alert(currency+'金額僅能至整數位');
			return false;
		}
	}
	else 
	{
		/*
		if (fl*100-Math.floor(fl*100)>0)
		{
			alert(currency+'金額小數至多兩位');
			return false;
		}
		*/
		if (amount.indexOf('.') == -1)
		{
			return true;
		}
		
		if (amount.length - amount.indexOf('.') == 1)
		{
			alert('小數點不可放在最後一位');
			return false;
		}
		if (amount.length - amount.indexOf('.') > 3)
		{
			alert(currency+'金額小數至多兩位');
			return false;
		}
	}
	return true;
}

function checkMoneyLength(amount, intnum, floatnum)
{
	// 沒有小數點
	if (amount.indexOf('.') == -1)
	{
		if (amount.length > intnum)
		{
			alert("整數部分只能輸入"+intnum+"位數字");
			return false;
		}
		else
			return true;
	}
	else
	{
		if (amount.substring(0,amount.indexOf('.')).length > intnum)
		{
			alert("整數部分只能輸入"+intnum+"位數字");
			return false;
		}
		
		if (amount.substring(amount.indexOf('.')+1 , amount.length).length > floatnum)
		{
			alert("小數部分只能輸入"+floatnum+"位數字");
			return false;
		}
		
	}
	
	return true;
}

//將金額依幣別取適當位數
function convMoney(currency, amount) {
	if (currency=="JPY" || currency=="ITL" || currency=="BEF" || currency=="TWD" || currency=="VND") {
		return formatDecimal(amount,0);
	} else {
		return formatDecimal(amount,2);
	}
}

function isMoney(obj){
  var money = trimString(obj.value);
  if(isNaN(money)){
    alert("輸入金額格式錯誤["+money+"]");
    obj.focus();
    return false;
  }
  return true;
}

/**
檢查src字串是否符合華南要求的金額輸入格式：
1、為數字
2、為整數
3、可以有空白
*/
function isHNCBMoneyInputFormat(src)
{
	src = trimString(src).toUpperCase();
	if(isNaN(src)) return false;
	if(src.indexOf('.')>=0) return false;
	if(src.indexOf('E')>=0) return false;
	if(src.indexOf(' ')>=0) return false;
	if(src.indexOf(' ')>=0) return false;
	return true;
}
/**
 * 顯示子視窗,提供列印功能
 */
function doPrint(){
	return;
	/*
	var child = null;
	if(child == null || child.closed) {
	  child = window.open('/netbank/pages/template/html/jsp_print.jsp',
	  '','width=600,height=400, toolbar=no,scrollbars=yes,resizable=yes');
	}
	*/
}
/**
 * 補足長度
 * @org:原始字串 String
 * @len:補滿的長度 int
 * @pad:要補的字串 String
 * @isleft:true表示由左補
 */

function padString(org, len, pad, isleft)
{
	var result = new String(org);
  	if(pad.length > 1)
 	  return org;
 	if(org.length > len)
  	  return org.substring(0, len);
	while(result.length < len){
   	  if(isleft){
   	 	result = pad + result;
      }
   	  else{
   	    result = result + pad;
      }
   	}
   return result;
}

//判斷是否為中文字---開始
function isCharsInBag(s, bag)
{  
  var i,c;
  for(i = 0; i < s.length; i++)
  {   
    c = s.charAt(i);
    if(bag.indexOf(c) > -1) 
      return c;
  }
  return "";
}

function isChinese(s)
{
  var errorChar;
  var badChar = " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789><,[]{}?/+=|\\'\":;~!#$%()`";
  
  errorChar = isCharsInBag(s, badChar);
  if(errorChar != "" )
  {
    return false;
  }       
  return true;
}
//判斷是否為中文字---結束


// 將金額數字轉為三位一撇 (目前只支援台幣, 無小數點)
function HNCBMoneyFormat(iAmount){
	
	if (isNaN(iAmount)){
		return iAmount;
	}
	
	var sAmount = new String(iAmount);
	
	if(sAmount.length<=3){
		return sAmount;
	}else{
		return HNCBMoneyFormat(sAmount.substr(0,sAmount.length-3)) +","+(sAmount.substr(sAmount.length-3));
	}
}

// 轉換身份證字號為顯示格式(前六碼替換為*)
function formatCustomerID( CustomerID ){
	var CustomerID = CustomerID + "";
  var result = "";
  var alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
	var isID = "f" ;
    
  if (alpha.indexOf(CustomerID.substr(0,1)) >= 0) {
  	isID = "t";
  }

  if (CustomerID.length == 10 && isID == "t")
  {
  	//result = "******" + CustomerID.substr(6);//前六碼替換為*
	result = CustomerID.substr(0, 2) + "******" + CustomerID.substr(8,2);//改為3-8碼替換為* modified at 20140529
  }else{
    result = CustomerID ;
  }

  return result;
}

// 檢查欄位固定長度 __________________________________________________________
function isFixedLength(desc, field, fixedLen, useFocus) {
  var chkValue = field.value;
  if (chkValue.length == fixedLen) {
    return true;
  } else {
    alert(desc + "欄位資料長度檢核錯誤，須輸入" + fixedLen + " 位數長度!!");
    if (useFocus) field.focus();
  }
  return false;
}

// 檢查欄位是否為數字 ________________________________________________________
function isNumber(desc, field, useFocus) {
  var chkValue = field.value;
  if (chkValue.length > 0 && chkValue.replace(/[0-9]/g, '') == '') {
    return true;
  } else {
    alert(desc + "欄位資料格式檢核錯誤，請輸入 0~9 數字!!");
    if (useFocus) field.focus();
  }
  return false;
}

//三位數以逗號區隔表示
function toThousands(num) {
	var result = '', counter = 0;
	var intergerPart = '';
	var deciamlPart = '';
	if(num.indexOf('.')>0){
		intergerPart = num.substring(0,num.indexOf('.'));
		deciamlPart = num.substring(num.indexOf('.'));
	}
	
	intergerPart = (intergerPart || 0).toString();
	for (var i = intergerPart.length - 1; i >= 0; i--) {
		result = intergerPart.charAt(i) + result;
		counter++;
		if (!(counter % 3) && i != 0) {
			result = ',' + result; 
		}
	}
	result = result+deciamlPart;
	return result;
}

/*  
 * 產生安控機制下拉式選單選項
 * Ex:
 * var securityModeInfo = {};
 * securityModeInfo.securityModeOps = <%=securityModeOps%>;
 * <body onLoad="genSecurityModeOptions(document.form.securityType, securityModeInfo);">
*/
function genSecurityModeOptions(selectElem, securityModeOps) {
    try {
        // 產生前先清空內容
        selectElem.innerHTML = '';
        for (var key in securityModeOps) {
            var option = document.createElement("option");
            var secOpt = securityModeOps[key];
            option.value = secOpt.value;
            option.text  = secOpt.text;
            option.selected = secOpt.selected;
            selectElem.appendChild(option);
        }
    } catch (err) { 
    }
}

/*
 * 取得時區
*/
function getTimeZone(){
    var today = new Date();
    //var tz = today.toTimeString();                    //23:15:30 GMT+0200 (CEST)     23:15:30 GMT+0800 (台北標準時間)
    var tz1 =(today.toTimeString().substring(9));       //GMT+0800 (台北標準時間)
    var tz2 = tz1.substring(0,tz1.indexOf(" "));        //GMT+0800
    //var tz3 = tz1.substring(0,tz1.indexOf(" ")-2);   //GMT+08
    //var hr4 = -(today.getTimezoneOffset() / 60);      //8
    return tz2;
}