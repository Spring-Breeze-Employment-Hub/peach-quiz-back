import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { v4 as uuidv4 } from 'uuid';

interface Player {
  clientId: string;
  nickname: string;
  role: string;
}

interface Room {
  id: string;
  players: Player[];
  isGameStarted: boolean;
  questionsCount: number; // 질문 갯수
  gameTimeOfSec: number; // 게임 시간
}

@WebSocketGateway()
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  constructor(private readonly gameService: GameService) {}

  private rooms: Record<string, Room> = {};

  /**
   * Socket Connect
   */
  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  /**
   * Socket Disconnect
   */
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Create Game (게임방을 생성하는 소켓요청)
   * @param {string} nickname 닉네임
   */
  @SubscribeMessage('create')
  async handleCreateGame(
    client: Socket,
    payload: { nickname: string },
  ): Promise<void> {
    const { nickname } = payload;
    const roomId = uuidv4(); // uuid를 사용한 roomid 생성
    const player: Player = { clientId: client.id, nickname, role: 'master' };

    // rooms객체에 roomId를 Key값으로 한 룸객체 생성
    this.rooms[roomId] = {
      id: roomId,
      players: [player],
      isGameStarted: false,
      questionsCount: null,
      gameTimeOfSec: null,
    };

    // 방을 생성한 클라이언트를 방에 참여시키기
    client.join(roomId);

    // 클라이언트에게 방 생성 성공을 알림
    client.emit('create', {
      status: 'success',
      message: '방 생성 완료',
      roomId,
    });
  }

  /**
   * Join Game (게임방에 참여하는 소켓요청)
   * @param {string} roomId 참여를 희망하는 방의 uuid
   * @param {string} nickname 닉네임
   */
  @SubscribeMessage('join')
  handleJoinGame(
    client: Socket,
    payload: { roomId: string; nickname: string },
  ): void {
    const { roomId, nickname } = payload;
    const room = this.rooms[roomId];
    const player: Player = { clientId: client.id, nickname, role: 'user' };

    if (room && !room.isGameStarted) {
      room.players.push(player);
      client.join(roomId);
      this.server.to(roomId).emit('join', {
        status: 'success',
        message: `${nickname}님이 게임에 참여하였습니다.`,
        clientId: client.id,
      });
    } else {
      client.emit('error', {
        status: 'error',
        message: '방이 존재하지 않습니다.',
      });
    }
  }

  /**
   * Start Game (게임을 시작하는 소켓요청)
   * @param {string} roomId 시작을 희망하는 방의 uuid
   */
  @SubscribeMessage('start')
  async handleStartGame(
    client: Socket,
    payload: { roomId: string; quizCategory: string },
  ): Promise<void> {
    const { roomId, quizCategory } = payload;
    const room = this.rooms[roomId];

    try {
      if (!room) {
        client.emit('error', {
          status: 'error',
          message: '방이 존재하지 않습니다.',
        });
        return;
      }

      // start를 요청한 client id를 player에서 찾는다
      const marsterArr = room.players.filter((el) => el.clientId === client.id);

      // Game이 시작되지 않았고 clientd의 역할이 'master'일 경우
      if (!room.isGameStarted && marsterArr[0].role === 'master') {
        room.isGameStarted = true;

        this.server.to(roomId).emit('start', {
          status: 'success',
          message: '게임 시작',
        });

        // openai api로 퀴즈를 생성
        const threadId = await this.gameService.createThread();

        // 퀴즈 데이터를 10번 요청하여 응답올 때마다 값을 emit
        for (let i = 0; i < 10; i++) {
          const quizData = await this.gameService.reqQuestionToOpenai(
            threadId,
            quizCategory,
          );

          if (quizData[0] === '{') {
            this.server.to(roomId).emit('quiz', {
              status: 'success',
              message: `퀴즈 ${i + 1}`,
              data: quizData,
            });
          }
        }

        this.endGame(roomId);

        // 60초 후 게임 종료 함수 호출
        // setTimeout(() => {
        //   this.endGame(roomId);
        // }, 10000);
      } else {
        client.emit('error', 'Game cannot be started');
      }
    } catch (error) {
      console.error('Error fetching quiz data:', error);
      client.emit('error', {
        status: 'error',
        message: '퀴즈를 가져오는 중 에러가 발생했습니다.',
      });

      // 에러 발생 시 게임 상태를 초기화
      room.isGameStarted = false;
    }
  }

  /**
   * End Game 게임종료를 실행하는 함수
   * @toDo 게임이 끝났으므로 방을 정리하는 기능 추가하기
   */
  endGame(roomId: string): void {
    const room = this.rooms[roomId];
    if (!room) return;

    room.isGameStarted = false;
    this.server.to(roomId).emit('end', {
      status: 'success',
      message: '게임 종료',
    });
  }
}