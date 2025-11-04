# silero_tts.py
import sys
import json
import torch
import numpy as np
import os
import platform
import re
import warnings

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

def init_model():
    device = torch.device('cpu')
    local_file = 'v5_ru.pt'
    
    if not os.path.exists(local_file):
        print("Загрузка модели Silero TTS v5...", file=sys.stderr)
        torch.hub.download_url_to_file('https://models.silero.ai/models/tts/ru/v5_ru.pt', local_file)
        print("Модель загружена успешно!", file=sys.stderr)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = torch.package.PackageImporter(local_file).load_pickle("tts_models", "model")
        model.to(device)

    return model, device

def text_to_speech(text, speaker='aidar', sample_rate=24000):
    model, device = init_model()
    
    try:
        audio = model.apply_tts(
            text=text,
            speaker=speaker,
            sample_rate=sample_rate,
            put_accent=True,
            put_yo=True
        )
        
        return audio.numpy(), sample_rate
        
    except Exception as e:
        print(f"Ошибка при генерации: {str(e)}", file=sys.stderr)        
        fallback_text = "Не удалось обработать сообщение"
            
        try:
            audio = model.apply_tts(
                text=fallback_text,
                speaker=speaker,
                sample_rate=sample_rate,
                put_accent=True,
                put_yo=True
            )
            return audio.numpy(), sample_rate
        except Exception as e2:
            print(f"Критическая ошибка: {str(e2)}", file=sys.stderr)
            return np.zeros(1000, dtype=np.float32), sample_rate

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            return
            
        params = json.loads(input_data)
        
        text = params.get('text', '')
        speaker = params.get('speaker', 'aidar')
        
        if not text.strip():
            return
            
        if re.match(r'^[\d\s\.\,\!\?\-]+$', text) and len(text.strip()) < 5:
            print(f"Пропущено: только цифры", file=sys.stderr)
            return
        
        audio_data, sample_rate = text_to_speech(
            text=text,
            speaker=speaker
        )
        
        audio_16bit = (audio_data * 32767).astype(np.int16)
        
        sys.stdout.buffer.write(audio_16bit.tobytes())
        sys.stdout.buffer.flush()
        
    except Exception as e:
        print(f"Ошибка в main: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()