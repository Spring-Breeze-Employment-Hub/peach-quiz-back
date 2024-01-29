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

    const roomId = client.data.roomId;

    if (roomId) {
      this.leaveRoom(client, roomId);
    }
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

    // 클라이언트 세션에 입장한 방 저장
    client.data.roomId = roomId;

    // 클라이언트에게 방 생성 성공을 알림
    client.emit('create', {
      status: 'success',
      message: '방 생성 완료',
      roomId,
      clientId: client.id,
      players: this.rooms[roomId].players,
      playerCount: this.getConnectedClients(roomId),
      gameStatus: 'ready',
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

    if (!nickname) {
      // 닉네임이 없을 경우
      client.emit('error', {
        status: 'error',
        message: '게임을 찾을 수 없습니다',
      });
      return;
    } else if (!nickname) {
      // 닉네임이 없을 경우
      client.emit('error', {
        status: 'error',
        message: '닉네임을 설정해주세요',
      });
      return;
    } else if (room.players.length >= 4) {
      // 최대 인원 제한
      client.emit('error', {
        status: 'error',
        message: '게임의 정원이 초과되었습니다',
      });
      return;
    } else if (room.isGameStarted === true) {
      // 게임 진행 중 입장 제한
      client.emit('error', {
        status: 'error',
        message: '게임이 진행중입니다',
      });
      return;
    } else if (this.playerJoinedCheck(client, roomId)) {
      client.emit('error', {
        status: 'error',
        message: '이미 접속중인 방입니다',
      });
      return;
    }

    if (room) {
      room.players.push(player);

      // 클라이언트를 방에 참여시키기
      client.join(roomId);

      // 클라이언트 세션에 입장한 방 저장
      client.data.roomId = roomId;

      this.server.to(roomId).emit('join', {
        status: 'success',
        message: `${nickname}님이 게임에 참여하였습니다`,
        clientId: client.id,
        nickname,
        players: room.players,
        playerCount: this.getConnectedClients(roomId),
      });
    } else {
      client.emit('error', {
        status: 'error',
        message: '방이 존재하지 않습니다',
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
          message: '방이 존재하지 않습니다',
        });
        return;
      } else if (!quizCategory) {
        client.emit('error', {
          status: 'error',
          message: '카테고리를 입력해 주세요',
        });
        return;
      }

      // player에서 master의 client id를 변수에 저장
      const masterId = room.players.find(
        (obj) => obj.role === 'master',
      ).clientId;

      // Game이 시작되지 않았고 client의 역할이 'master'일 경우
      if (!room.isGameStarted && client.id === masterId) {
        room.isGameStarted = true;

        this.server.to(roomId).emit('start', {
          status: 'success',
          message: '게임 준비',
          gameStatus: 'loading',
        });

        // openai api로 퀴즈를 생성
        const threadId = await this.gameService.createThread();

        // 퀴즈 데이터를 10번 요청하여 응답올 때마다 값을 emit
        for (let i = 0; i < 10; i++) {
          const quizData = await this.gameService.reqQuestionToOpenai(
            threadId,
            quizCategory,
          );

          if (i === 0) {
            this.server.to(roomId).emit('start', {
              status: 'success',
              message: '게임 시작',
              gameStatus: 'start',
            });
          }

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
        client.emit('error', {
          status: 'error',
          message: '게임을 시작할 수 없습니다.',
        });
      }
    } catch (error) {
      console.error('Error fetching quiz data:', error);
      client.emit('error', {
        status: 'error',
        message: '퀴즈를 가져오는 중 에러가 발생했습니다',
      });

      // 에러 발생 시 게임 상태를 초기화
      room.isGameStarted = false;
    }
  }

  /**
   * End Game (게임종료 기능)
   */
  endGame(roomId: string): void {
    const room = this.rooms[roomId];
    if (!room) return;

    room.isGameStarted = false;
    this.server.to(roomId).emit('end', {
      status: 'success',
      message: '게임 종료',
      gameStatus: 'ready',
    });
  }

  /**
   * Leave Game (방에서 나가는 기능을 실행하는 소켓)
   */
  @SubscribeMessage('leave')
  async handleLeaveRoom(client: Socket): Promise<void> {
    const roomId = client.data.roomId;
    if (!roomId) {
      client.emit('error', {
        status: 'error',
        message: '방을 찾을 수 없습니다',
      });
      return;
    }

    this.leaveRoom(client, roomId);
  }

  /**
   * Leave Room (방에서 나가는 기능을 실행하는 함수)
   */
  private leaveRoom(client: Socket, roomId: string) {
    const room = this.rooms[roomId];
    const player = room.players.find((player) => player.clientId === client.id);

    if (!player) {
      client.emit('error', {
        status: 'error',
        message: '플레이어를 찾을 수 없습니다',
      });
      return;
    }

    const remainPlayers = room.players.filter(
      (player) => player.clientId !== client.id,
    );

    this.rooms[roomId].players = remainPlayers;

    if (player.role === 'master') {
      this.server.to(roomId).emit('leave', {
        status: 'success',
        message: '방장이 게임에서 나가셨습니다',
      });

      delete this.rooms[roomId];
    } else {
      this.server.to(roomId).emit('leave', {
        status: 'success',
        message: `${player.nickname}님이 게임에서 나가셨습니다.`,
        nickname: player.nickname,
        players: room.players,
        playerCount: this.getConnectedClients(roomId) - 1,
      });
    }

    client.leave(roomId);
  }

  /**
   * roomId에 연결된 소켓의 수를 조회하는 함수
   */
  getConnectedClients(roomId: string): number {
    const connectedSockets = this.server.of('/').adapter.rooms.get(roomId);
    const numberOfClients = connectedSockets ? connectedSockets.size : 0;
    return numberOfClients;
  }

  /**
   * Client가 Room에 연렬되어 있는지 확인하는 함수
   * @param {Socket} client client
   * @param {string} roomId room의 uuid
   * @returns true / false
   */
  playerJoinedCheck(client: Socket, roomId: string) {
    const connectedSockets = this.server.of('/').adapter.rooms.get(roomId);
    const clientIdArr = [...connectedSockets];
    return clientIdArr.find((clientId) => clientId === client.id);
  }
}
