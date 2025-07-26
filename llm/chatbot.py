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

def generate_quiz_prompt(content, specifications):
    return ask(f"""
You are a world-class educational AI that specializes in generating challenging, accurate, and pedagogically-sound quizzes.

You will receive content such as lecture notes, textbook excerpts, study materials, or educational text. Your task is to:

1. Carefully analyze the content to understand key concepts, facts, and relationships.
2. Generate a quiz consisting of {specifications['questions']} questions (make sure you get the number of questions right). The question types should be {specifications['question_types']} that test understanding, not just memory. You need to have at least one of each of the question types provided.
3. Your questions will be in the form of a json list and the questions will be as such:

For every question:
{{
    "text": &lt;question, and for fill-in-blank, use three underscores (___) to denote the blank&gt;,
    "type": &lt;"multiple-choice" or "true-false" or "short-answer" or "fill-in-blank", depending on the question type&gt;,
    "options": {{
        "A": "&lt;option 1&gt;",
        "B": "&lt;option 2&gt;",
        "C": "&lt;option 3&gt;",
        "D": "&lt;option 4&gt;"
    }} for mcq questions, null for everything else,
    "correct_answer": &lt;index of current answer from 0-3 for mcq, 0=True 1=False for true-false, ideal answer for short answer, and an array with the right answers for fill in the blanks&gt;
    "explanation": &lt;good and brief explanation to really help the student understand&gt;
}}
Your response must be a list like this: {{"questions": [...]}} filled with the questions in the format specified above. Do not include any other things except the pure json itself (no markers such as ```json either)

**Instructions:**
- Avoid yes/no or true/false questions.
- Focus on critical thinking and application-based questions where possible.
- Use clear, academic language but keep it student-friendly.
- Do not ask questions unrelated to the input content.
- The quiz difficulty must be {specifications['difficulty']}

Now generate the quiz based on the following content:

\"\"\"
{content}
\"\"\"
""")