
//hb13363 add on 20160311 �K�X����
function setPwdInfo(targetID, lang, iconPos, blockPos) {
	
	var $target = $(targetID);
	
	$.ajax({
		type: "POST",
		url: "/netbank/pages/jsp/Login/html/Login.json",
		contentType: "application/json; charset=utf-8",
		dataType: "json", 
		cache: false
	}).done(function (json) {
		
		var pwdInfo = json.pwdInfo;
		var $icon	= $(pwdInfo.icon || "#pwdInfo");
		var $block	= $(pwdInfo.block || "#pwdInfoContent");
		var title 	= pwdInfo.title[lang];
		var contents= pwdInfo.content[lang];
		var items 	= [];
		
		items.push('<p>' + title + '</p>');
		items.push('<hr />');
		items.push('<ol>');
		
		$.each(contents, function(key, val) {
			items.push('<li>' + val + '</li>');
		});
		
		items.push('</ol>');
		
		//set content
		$block.html(items.join(""));
		
		setPosition($target, $icon, iconPos.left, iconPos.top);
		setPosition($target, $block, blockPos.left, blockPos.top);

		//To show the instruction of password
		$icon.hover(function() {
			$block.fadeIn(500, function() {
				setPosition($target, $block, blockPos.left, blockPos.top);
			});
		}, function() {
			$block.fadeOut(800);
		});
		
	}).fail(function( xhr, status, errorThrown ) {
		alert( "Sorry, there was a problem!" );
	}).always(function( xhr, status ) {
		//console.log( "The request is complete!" );
	});
	
}


function setPosition($attachObj, $targetObj, left, top) {
	var offset = $attachObj.offset();
	
	$targetObj.offset({
		left: offset.left + left, 
		top: offset.top + top
	});
}

function encryptNickName(pubkey,nickname){
	try{
		var encrypt = new JSEncrypt();
		if(pubkey){
			encrypt.setPublicKey(pubkey);
			var result = encrypt.encrypt(nickname);
			console.log(result);
			if(result){
				return 'ENC('+result+')';
			}else{
				return nickname;
			}
		}else{
			return nickname;
		}
	}catch(error){
		console.error(error);
		return nickname;
	}
}