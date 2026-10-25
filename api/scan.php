<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require __DIR__.'/config.php';
function respond(int $code,array $data): never {http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit;}
if($_SERVER['REQUEST_METHOD']!=='POST')respond(405,['ok'=>false,'error'=>'POST required']);
if(!isset($_FILES['plan'])||!is_array($_FILES['plan']))respond(400,['ok'=>false,'error'=>'No map uploaded']);
$f=$_FILES['plan'];
if(($f['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK)respond(400,['ok'=>false,'error'=>'Upload failed. Check PHP upload_max_filesize and post_max_size settings.']);
if(($f['size']??0)>VASTU_UPLOAD_LIMIT)respond(413,['ok'=>false,'error'=>'Maximum 12 MB map allowed']);
if(!is_uploaded_file($f['tmp_name']))respond(400,['ok'=>false,'error'=>'Invalid upload']);
$extension=strtolower(pathinfo((string)$f['name'],PATHINFO_EXTENSION));
$types=['jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp','pdf'=>'application/pdf'];
if(!isset($types[$extension]))respond(415,['ok'=>false,'error'=>'Only JPG, PNG, WEBP, PDF are accepted']);
$actual=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
$accepted=$extension==='jpg'||$extension==='jpeg'?['image/jpeg']:($extension==='pdf'?['application/pdf','application/octet-stream']:[$types[$extension]]);
if(!in_array($actual,$accepted,true))respond(415,['ok'=>false,'error'=>'File content does not match its extension']);
try{$id=bin2hex(random_bytes(12));}catch(Throwable $e){respond(500,['ok'=>false,'error'=>'Cannot create upload id']);}
$folder=dirname(__DIR__).DIRECTORY_SEPARATOR.'uploads';
if(!is_dir($folder)&&!mkdir($folder,0755,true))respond(500,['ok'=>false,'error'=>'Upload directory not writable']);
$path=$folder.DIRECTORY_SEPARATOR.$id.'.'.$extension;
if(!move_uploaded_file($f['tmp_name'],$path))respond(500,['ok'=>false,'error'=>'Unable to save uploaded file']);
$script=dirname(__DIR__).DIRECTORY_SEPARATOR.'python'.DIRECTORY_SEPARATOR.'scan_floorplan.py';
if(!function_exists('proc_open'))respond(500,['ok'=>false,'error'=>'PHP proc_open is disabled. Enable it in php.ini for local scanning.']);
$preview=$extension==='pdf'?$folder.DIRECTORY_SEPARATOR.$id.'-preview.png':null;
$cmd=[VASTU_PYTHON,$script,$path,'',$preview??''];
// Avoid overlapping OCR processes exhausting Render Free's 512MB RAM.
$storage=dirname(__DIR__).'/storage';
if (!is_dir($storage)) @mkdir($storage,0750,true);
$lockHandle=@fopen($storage.'/.scan.lock','c');
if (!$lockHandle || !@flock($lockHandle,LOCK_EX|LOCK_NB)) {
    @unlink($path);
    respond(429,['ok'=>false,'error'=>'Cloud scanner is busy. Please retry after the current scan finishes.']);
}
register_shutdown_function(static function() use ($lockHandle): void {
    if(is_resource($lockHandle)){@flock($lockHandle,LOCK_UN);@fclose($lockHandle);}
});
$started=microtime(true);
$maxSeconds=130;
$descriptors=[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
$process=@proc_open($cmd,$descriptors,$pipes,dirname(__DIR__));
if(!is_resource($process))respond(500,['ok'=>false,'error'=>'Cloud Python process could not start. Check Render server logs.']);
fclose($pipes[0]);
stream_set_blocking($pipes[1],false);
stream_set_blocking($pipes[2],false);
$stdout='';$stderr='';$timedOut=false;
$reportedExit=-1;
while(true){
    $read=[];
    if(!feof($pipes[1]))$read[]=$pipes[1];
    if(!feof($pipes[2]))$read[]=$pipes[2];
    if($read){
        $write=null;$except=null;
        @stream_select($read,$write,$except,1,0);
        foreach($read as $stream){
            $chunk=@fread($stream,65536);
            if($chunk!==false&&$chunk!==''){
                if($stream===$pipes[1])$stdout.=substr($chunk,0,max(0,1500000-strlen($stdout)));
                else $stderr.=substr($chunk,0,max(0,100000-strlen($stderr)));
            }
        }
    }else usleep(100000);
    $processInfo=proc_get_status($process);
    if(!$processInfo['running']){
        $reportedExit=(int)$processInfo['exitcode'];
        $stdout.=stream_get_contents($pipes[1]);
        $stderr.=stream_get_contents($pipes[2]);
        break;
    }
    if(microtime(true)-$started>$maxSeconds){
        $timedOut=true;
        @proc_terminate($process,15);
        break;
    }
}
fclose($pipes[1]);fclose($pipes[2]);
$status=proc_close($process);
if($status<0&&$reportedExit>=0)$status=$reportedExit;
if($timedOut){
    error_log('[VASTUAALAY] Cloud OCR timed out after '.round(microtime(true)-$started).' seconds. STDERR: '.substr($stderr,0,500));
    respond(504,['ok'=>false,'error'=>'Cloud scanner took too long. Please use a smaller, clear PNG/JPG floor plan and retry.']);
}
error_log('[VASTUAALAY] Scan process exit='.$status.' duration='.round(microtime(true)-$started,1).'s outputBytes='.strlen($stdout).' stderr='.substr($stderr,0,300));
$decoded=json_decode((string)$stdout,true);
if(!is_array($decoded)){
    $diagnostic=trim((string)$stderr); if($diagnostic==='') $diagnostic='Python returned no JSON. Exit code: '.$status.'; first output: '.substr(trim((string)$stdout),0,150);
    $log=dirname(__DIR__).'/storage/scanner_debug.log';
    @file_put_contents($log, '['.date('c').'] Python exit='.$status.PHP_EOL.substr((string)$stderr,0,4000).PHP_EOL.'STDOUT: '.substr((string)$stdout,0,600).PHP_EOL.'---'.PHP_EOL, FILE_APPEND | LOCK_EX);
    $local=in_array(($_SERVER['REMOTE_ADDR']??''),['127.0.0.1','::1'],true);
    respond(500,['ok'=>false,'error'=>'Scanner did not return valid JSON.'.($local?' DETAILS: '.substr($diagnostic,0,260):' Check server log.'),'diagnostic'=>$local?substr($diagnostic,0,800):'See private server logs']);
}
if(($decoded['ok']??false)!==true)respond(422,['ok'=>false,'error'=>$decoded['error']??'Scan failed','diagnostic'=>in_array(($_SERVER['REMOTE_ADDR']??''),['127.0.0.1','::1'],true)?substr((string)$stderr,0,300):'OCR could not process this image']);
// Image used as a verified reference for manual editing; never trust client-selected paths.
$decoded['upload_url']='uploads/'.$id.($preview!==null?'-preview.png':'.'.$extension);
$decoded['original_url']='uploads/'.$id.'.'.$extension;
$decoded['upload_id']=$id;
respond(200,$decoded);
