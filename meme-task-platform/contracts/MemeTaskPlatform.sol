// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract MemeTaskPlatform is ReentrancyGuard {
    struct Task {
        address creator;
        address token;
        uint256 reward;
        string description;
        address assignee;
        bool completed;
        bool cancelled;
        uint256 deadline;
    }
    
    uint256 public taskCounter;
    mapping(uint256 => Task) public tasks;
    
    event TaskCreated(uint256 indexed taskId, address indexed creator, address token, uint256 reward);
    event TaskAssigned(uint256 indexed taskId, address indexed assignee);
    event TaskCompleted(uint256 indexed taskId, address indexed assignee);
    event TaskCancelled(uint256 indexed taskId);
    
    function createTask(
        address _token,
        uint256 _reward,
        string memory _description,
        uint256 _deadline
    ) external nonReentrant returns (uint256) {
        require(_reward > 0, "Reward must be > 0");
        require(_deadline > block.timestamp, "Invalid deadline");
        
        IERC20(_token).transferFrom(msg.sender, address(this), _reward);
        
        uint256 taskId = taskCounter++;
        tasks[taskId] = Task({
            creator: msg.sender,
            token: _token,
            reward: _reward,
            description: _description,
            assignee: address(0),
            completed: false,
            cancelled: false,
            deadline: _deadline
        });
        
        emit TaskCreated(taskId, msg.sender, _token, _reward);
        return taskId;
    }
    
    function assignTask(uint256 _taskId) external {
        Task storage task = tasks[_taskId];
        require(task.assignee == address(0), "Already assigned");
        require(!task.cancelled, "Task cancelled");
        require(block.timestamp < task.deadline, "Task expired");
        
        task.assignee = msg.sender;
        emit TaskAssigned(_taskId, msg.sender);
    }
    
    function completeTask(uint256 _taskId) external nonReentrant {
        Task storage task = tasks[_taskId];
        require(msg.sender == task.creator, "Only creator");
        require(task.assignee != address(0), "Not assigned");
        require(!task.completed, "Already completed");
        require(!task.cancelled, "Task cancelled");
        
        task.completed = true;
        IERC20(task.token).transfer(task.assignee, task.reward);
        
        emit TaskCompleted(_taskId, task.assignee);
    }
    
    function cancelTask(uint256 _taskId) external nonReentrant {
        Task storage task = tasks[_taskId];
        require(msg.sender == task.creator, "Only creator");
        require(!task.completed, "Already completed");
        require(!task.cancelled, "Already cancelled");
        
        task.cancelled = true;
        IERC20(task.token).transfer(task.creator, task.reward);
        
        emit TaskCancelled(_taskId);
    }
}
