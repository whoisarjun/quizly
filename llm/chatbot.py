from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI()

def ask(prompt):
    response = client.responses.create(
        model="gpt-4.1-mini",
        input=prompt
    )
    return response.output_text

def generate_quiz_prompt(content):
    return ask(f"""
You are a world-class educational AI that specializes in generating challenging, accurate, and pedagogically-sound quizzes.

You will receive content such as lecture notes, textbook excerpts, study materials, or educational text. Your task is to:

1. Carefully analyze the content to understand key concepts, facts, and relationships.
2. Generate a quiz consisting of **multiple-choice questions (MCQs)** that test understanding, not just memory.
3. For each question, provide:
   - The **question text**.
   - **4 options** labeled A to D.
   - The **correct answer** label.
   - A brief explanation (1–2 lines) justifying the correct answer.

**Instructions:**
- Avoid yes/no or true/false questions.
- Focus on critical thinking and application-based questions where possible.
- Use clear, academic language but keep it student-friendly.
- Do not ask questions unrelated to the input content.

Now generate the quiz based on the following content:

\"\"\"
{content}
\"\"\"
""")