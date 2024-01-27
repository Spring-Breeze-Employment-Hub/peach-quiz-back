import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { openaiAssistantInstruction } from './prompt';

@Injectable()
export class GameService {
  openai = new OpenAI();
  OPENAI_ASSISTANT_ID = 'asst_gSdwXUgY3P66q4lnUiPjdjff';

  async createAssistant() {
    // const myAssistants = await this.openai.beta.assistants.list();
    const myAssistant = await this.openai.beta.assistants.create({
      instructions: openaiAssistantInstruction,
      name: 'Peach-Quiz',
      tools: [],
      model: 'gpt-3.5-turbo-1106',
    });

    return myAssistant;
  }

  async createThread() {
    const thread = await this.openai.beta.threads.create();
    return thread.id;
  }

  async createMessage(threadId: string, quizCategory: string) {
    await this.openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: quizCategory,
    });
  }

  async reqQuestionToOpenai(threadId: string, quizCategory: string) {
    try {
      await this.createMessage(threadId, quizCategory);

      let run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: this.OPENAI_ASSISTANT_ID,
      });

      // Run complete 여부 3초마다 체크하여 completed가 아닌경우 반복 실행
      while (run.status != 'completed') {
        console.log('Openai Runs Satus: ', run.status);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        run = await this.openai.beta.threads.runs.retrieve(
          run.thread_id,
          run.id,
        );
      }

      // while문을 빠져나왔다는 것은 run 진행상황이 완료됐다는 것이니 메세지 불러오기
      const messagesArr = await this.openai.beta.threads.messages.list(
        run.thread_id,
        {
          order: 'asc',
          limit: 50,
        },
      );

      const lastMessageData = messagesArr.data[messagesArr.data.length - 1];
      const quizData = lastMessageData.content[0]['text']['value'];

      return quizData;
    } catch (error) {
      console.log(error);
    }
  }
}
