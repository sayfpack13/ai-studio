import re


def clean_model_output(text):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"\n*(assistant|user)\n*", "", text)
    text = re.sub(r"\n+", "\n", text).strip()
    return text


def is_unsafe_prompt(model, tokenizer, system_prompt=None, user_prompt=None, max_new_token=10):
    system_text = "" if system_prompt is None else str(system_prompt)
    user_text = "" if user_prompt is None else str(user_prompt)
    messages = [{"role": "system", "content": system_text}, {"role": "user", "content": user_text}]

    try:
        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except TypeError:
        # Some tokenizers do not support enable_thinking.
        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

    model_inputs = tokenizer([text], return_tensors="pt").to(model.device)

    generated_ids = model.generate(**model_inputs, max_new_tokens=max_new_token)
    output_ids = generated_ids[0][-max_new_token:].tolist()

    content = tokenizer.decode(output_ids, skip_special_tokens=True).strip("\n")

    return "yes" in content.lower()